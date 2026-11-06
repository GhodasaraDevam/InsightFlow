import mongoose, { Schema } from "mongoose";
import type { ISessionDocument } from "./session.types.js";

const deviceInfoSchema = new Schema(
  {
    deviceType: { type: String },
    os: { type: String },
    browser: { type: String },
  },
  { _id: false }
);

const sessionSchema = new Schema<ISessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    refreshTokenHash: {
      type: String,
      required: [true, "Refresh token hash is required"],
      select: false,
    },
    deviceInfo: {
      type: deviceInfoSchema,
      default: undefined,
    },
    ipAddress: {
      type: String,
      default: undefined,
    },
    userAgent: {
      type: String,
      default: undefined,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
    },
    revokedAt: {
      type: Date,
      default: undefined,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "sessions",
  }
);

// TTL index: MongoDB automatically removes expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Query sessions by user
sessionSchema.index({ userId: 1 });

export const Session = mongoose.model<ISessionDocument>("Session", sessionSchema);
