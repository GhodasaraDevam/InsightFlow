import mongoose from "mongoose";
import { User } from "../users/user.model.js";
import { Session } from "../sessions/session.model.js";
import { UserRole, AccountStatus } from "../users/user.constants.js";
import { hashPassword, comparePassword } from "../../utils/password.util.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.util.js";
import { hashToken, generateSecureTokenId } from "../../utils/crypto.util.js";
import { revokedSessionRegistry } from "../../utils/token-cache.util.js";
import { AppError } from "../../utils/app-error.util.js";
import type { RegisterSchema, LoginSchema } from "./auth.validator.js";
import type {
  RegisterResult,
  LoginResult,
  RefreshResult,
  SafeUser,
} from "./auth.types.js";
import type { IUserDocument } from "../users/user.types.js";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const toSafeUser = (user: IUserDocument): SafeUser => {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    isEmailVerified: user.isEmailVerified,
    profilePicture: user.profilePicture,
    preferences: user.preferences || {},
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
};

export class AuthService {
  /**
   * Registers a new user account.
   */
  public async register(input: RegisterSchema): Promise<RegisterResult> {
    const email = input.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      throw new AppError("An account with this email address already exists", 409, [
        { field: "email", message: "Email is already registered" },
      ]);
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(input.password);

    // Create user with default role, active status, unverified email
    const newUser = await User.create({
      fullName: input.fullName.trim(),
      email,
      passwordHash,
      role: UserRole.USER,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: false,
      tokenVersion: 0,
      preferences: {},
    });

    return {
      user: toSafeUser(newUser),
    };
  }

  /**
   * Authenticates user credentials, generates tokens and tracks session.
   */
  public async login(
    input: LoginSchema,
    clientInfo: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<LoginResult> {
    const email = input.email.toLowerCase().trim();

    // Retrieve user including passwordHash and tokenVersion
    const user = await User.findOne({ email }).select("+passwordHash +tokenVersion");
    if (!user) {
      // Mitigate timing attack by executing a constant-time dummy hash compare
      await comparePassword(
        input.password,
        "$2b$12$e80yqV2Rk8yO9Xh4k6mK7eU0f4b3C5g8h9j1k2l3m4n5o6p7q8r9s"
      );
      throw new AppError("Invalid email or password", 401);
    }

    // Verify password
    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError("Invalid email or password", 401);
    }

    // Check account status
    if (user.accountStatus === AccountStatus.SUSPENDED) {
      throw new AppError("Account is suspended. Please contact support.", 403);
    }

    if (user.accountStatus === AccountStatus.DELETED) {
      throw new AppError("Account has been deactivated", 403);
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    // Create Session
    const sessionId = new mongoose.Types.ObjectId();
    const tokenId = generateSecureTokenId();

    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
      sessionId: sessionId.toString(),
      tokenId,
    });

    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await Session.create({
      _id: sessionId,
      userId: user._id,
      refreshTokenHash,
      consumedTokenHashes: [],
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      expiresAt,
      lastUsedAt: new Date(),
    });

    // Generate Access Token
    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId: sessionId.toString(),
      tokenVersion: user.tokenVersion || 0,
    });

    return {
      user: toSafeUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refreshes access token and rotates refresh token using an atomic token-family strategy.
   */
  public async refresh(
    rawRefreshToken: string,
    clientInfo: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<RefreshResult> {
    if (!rawRefreshToken) {
      throw new AppError("Refresh token is required", 401);
    }

    // 1. Verify token signature, expiration and claims
    const decoded = verifyRefreshToken(rawRefreshToken);
    const incomingTokenHash = hashToken(rawRefreshToken);
    const sessionId = decoded.sessionId;

    // 2. Fetch existing session to inspect state
    const session = await Session.findById(sessionId).select("+refreshTokenHash +consumedTokenHashes");
    if (!session) {
      throw new AppError("Session does not exist or has expired", 401);
    }

    if (session.revokedAt) {
      throw new AppError("Session has been revoked", 401);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppError("Session has expired", 401);
    }

    // 3. REUSE DETECTION: Check if token was previously consumed
    if (session.consumedTokenHashes && session.consumedTokenHashes.includes(incomingTokenHash)) {
      // Immediately revoke session to protect account
      session.revokedAt = new Date();
      await session.save();
      revokedSessionRegistry.revoke(sessionId);

      console.warn(
        `[SECURITY ALERT] Refresh token reuse detected for session ${sessionId}, user ${decoded.sub}. Session has been revoked.`
      );

      throw new AppError("Security alert: Refresh token reuse detected. Session has been revoked.", 401);
    }

    // 4. ATOMIC ROTATION
    const newTokenId = generateSecureTokenId();
    const newRefreshToken = generateRefreshToken({
      sub: decoded.sub,
      sessionId,
      tokenId: newTokenId,
    });
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    // Atomically rotate: only succeeds if current refreshTokenHash still matches
    const updatedSession = await Session.findOneAndUpdate(
      {
        _id: sessionId,
        refreshTokenHash: incomingTokenHash,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          refreshTokenHash: newRefreshTokenHash,
          lastUsedAt: new Date(),
          expiresAt: newExpiresAt,
          ipAddress: clientInfo.ipAddress || session.ipAddress,
          userAgent: clientInfo.userAgent || session.userAgent,
        },
        $push: {
          consumedTokenHashes: {
            $each: [incomingTokenHash],
            $slice: -20, // maintain the last 20 consumed token hashes
          },
        },
      },
      { returnDocument: "after" }
    );

    // If update returned null, a concurrent request or race condition occurred
    if (!updatedSession) {
      // Re-query to determine if it was consumed concurrently
      const racedSession = await Session.findById(sessionId).select("+consumedTokenHashes");
      if (racedSession && racedSession.consumedTokenHashes?.includes(incomingTokenHash)) {
        // Race condition or replay: revoke session immediately
        await Session.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
        revokedSessionRegistry.revoke(sessionId);
        throw new AppError("Concurrent refresh collision or token reuse detected. Session revoked.", 401);
      }
      throw new AppError("Failed to refresh session: session may have been rotated or revoked", 401);
    }

    // 5. Verify user is still active
    const user = await User.findById(decoded.sub).select("role accountStatus isEmailVerified tokenVersion email");
    if (!user) {
      throw new AppError("User account no longer exists", 401);
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new AppError("Account is not active", 403);
    }

    // 6. Generate new Access Token
    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
      tokenVersion: user.tokenVersion || 0,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logs out the current session.
   */
  public async logout(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await Session.updateOne(
      { _id: sessionId },
      { $set: { revokedAt: new Date() } }
    );

    revokedSessionRegistry.revoke(sessionId);
  }

  /**
   * Logs out all sessions for the specified user and increments tokenVersion.
   */
  public async logoutAll(userId: string): Promise<void> {
    if (!userId) return;

    // Revoke all active sessions in MongoDB
    await Session.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );

    // Increment user tokenVersion to immediately invalidate all outstanding access tokens
    await User.updateOne(
      { _id: userId },
      { $inc: { tokenVersion: 1 } }
    );
  }
}

export const authService = new AuthService();
