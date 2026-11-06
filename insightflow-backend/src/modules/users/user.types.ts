import type { Document, Types } from "mongoose";
import type { UserRole, AccountStatus } from "./user.constants.js";

export interface UserPreferences {
  theme?: "light" | "dark" | "system";
  language?: string;
  notificationsEnabled?: boolean;
}

export interface IUser {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  profilePicture?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  isEmailVerified: boolean;
  emailVerifiedAt?: Date;
  lastLoginAt?: Date;
  preferences: UserPreferences;
  tokenVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends Omit<IUser, "_id">, Document {}

/**
 * Fields that should never be returned in API responses.
 */
export const USER_SENSITIVE_FIELDS = ["-passwordHash"] as const;
