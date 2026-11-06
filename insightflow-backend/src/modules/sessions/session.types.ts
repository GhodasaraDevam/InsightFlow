import type { Document, Types } from "mongoose";

export interface DeviceInfo {
  deviceType?: string;
  os?: string;
  browser?: string;
}

export interface ISession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  deviceInfo?: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISessionDocument extends Omit<ISession, "_id">, Document {}
