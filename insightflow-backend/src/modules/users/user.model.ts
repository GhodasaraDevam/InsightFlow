import mongoose, { Schema } from "mongoose";
import type { IUserDocument } from "./user.types.js";
import { USER_ROLES, ACCOUNT_STATUSES, UserRole, AccountStatus } from "./user.constants.js";

const userPreferencesSchema = new Schema(
  {
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    language: {
      type: String,
      default: "en",
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const userSchema = new Schema<IUserDocument>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [1, "Full name cannot be empty"],
      maxlength: [200, "Full name cannot exceed 200 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },
    profilePicture: {
      type: String,
      default: undefined,
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: "Invalid user role: {VALUE}",
      },
      default: UserRole.USER,
    },
    accountStatus: {
      type: String,
      enum: {
        values: ACCOUNT_STATUSES,
        message: "Invalid account status: {VALUE}",
      },
      default: AccountStatus.ACTIVE,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: {
      type: Date,
      default: undefined,
    },
    lastLoginAt: {
      type: Date,
      default: undefined,
    },
    preferences: {
      type: userPreferencesSchema,
      default: () => ({}),
    },
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true,
    collection: "users",
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUserDocument>("User", userSchema);
