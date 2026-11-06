import { User } from "./user.model.js";
import { Session } from "../sessions/session.model.js";
import { hashPassword, comparePassword } from "../../utils/password.util.js";
import { AppError } from "../../utils/app-error.util.js";
import type { UpdateProfileSchema, ChangePasswordSchema } from "./user.validator.js";
import type { SafeUser } from "../auth/auth.types.js";
import type { IUserDocument } from "./user.types.js";

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

export class UserService {
  /**
   * Retrieves current authenticated user's profile.
   */
  public async getProfile(userId: string): Promise<SafeUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    return toSafeUser(user);
  }

  /**
   * Updates current user's profile with strict field filtering.
   */
  public async updateProfile(
    userId: string,
    input: UpdateProfileSchema
  ): Promise<SafeUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (input.fullName !== undefined) {
      user.fullName = input.fullName;
    }

    if (input.profilePicture !== undefined) {
      user.profilePicture = input.profilePicture;
    }

    if (input.preferences) {
      user.preferences = {
        ...user.preferences,
        ...input.preferences,
      };
    }

    await user.save();

    return toSafeUser(user);
  }

  /**
   * Changes the user's password, invalidates all sessions, and increments tokenVersion.
   */
  public async changePassword(
    userId: string,
    input: ChangePasswordSchema
  ): Promise<void> {
    const user = await User.findById(userId).select("+passwordHash +tokenVersion");
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Verify current password
    const isCurrentValid = await comparePassword(input.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new AppError("Current password is incorrect", 400, [
        { field: "currentPassword", message: "Current password is incorrect" },
      ]);
    }

    // Verify new password is not identical to current
    const isSamePassword = await comparePassword(input.newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new AppError("New password cannot be the same as your current password", 400, [
        { field: "newPassword", message: "New password cannot be the same as current password" },
      ]);
    }

    // Hash new password
    const newHash = await hashPassword(input.newPassword);
    user.passwordHash = newHash;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    // Revoke all existing sessions
    await Session.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
  }
}

export const userService = new UserService();
