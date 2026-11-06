import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.util.js";
import { revokedSessionRegistry } from "../utils/token-cache.util.js";
import { User } from "../modules/users/user.model.js";
import { AccountStatus } from "../modules/users/user.constants.js";
import { AppError } from "../utils/app-error.util.js";

/**
 * Express middleware to authenticate requests via Bearer access token.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Authorization token is missing or malformed", 401);
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      throw new AppError("Authorization token is missing", 401);
    }

    // 1. Verify token signature, expiration, issuer, audience
    const decoded = verifyAccessToken(token);

    // 2. Check in-memory revoked session registry (immediate revocation)
    if (decoded.sessionId && revokedSessionRegistry.isRevoked(decoded.sessionId)) {
      throw new AppError("Session has been revoked", 401);
    }

    // 3. Validate user identity and check account status
    const user = await User.findById(decoded.sub)
      .select("role accountStatus isEmailVerified tokenVersion email")
      .lean();

    if (!user) {
      throw new AppError("User account no longer exists", 401);
    }

    // 4. Validate account status
    if (user.accountStatus === AccountStatus.SUSPENDED) {
      throw new AppError("Account is suspended. Please contact support.", 403);
    }

    if (user.accountStatus === AccountStatus.DELETED) {
      throw new AppError("Account has been deactivated", 403);
    }

    // 5. Validate tokenVersion (instant invalidation on password change or logout-all)
    if (
      typeof decoded.tokenVersion === "number" &&
      typeof user.tokenVersion === "number" &&
      decoded.tokenVersion < user.tokenVersion
    ) {
      throw new AppError("Session has expired due to security updates. Please log in again.", 401);
    }

    // 6. Attach authenticated user details to Express request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      isEmailVerified: user.isEmailVerified,
      sessionId: decoded.sessionId,
      tokenVersion: user.tokenVersion,
    };
    req.sessionId = decoded.sessionId;

    next();
  } catch (error) {
    next(error);
  }
};
