import jwt from "jsonwebtoken";
import type { SignOptions, VerifyOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./app-error.util.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  tokenVersion?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  tokenId: string;
}

const JWT_ISSUER = "insightflow-backend";
const JWT_AUDIENCE = "insightflow-app";

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: "HS256",
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
};

export const generateRefreshToken = (payload: RefreshTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: "HS256",
  };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const options: VerifyOptions = {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    };

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, options) as jwt.JwtPayload;
    if (!decoded.sub || !decoded.sessionId || !decoded.role || !decoded.email) {
      throw new AppError("Invalid access token claims", 401);
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
      tokenVersion: typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : undefined,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Access token has expired", 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError("Invalid access token signature or format", 401);
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Access token verification failed", 401);
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const options: VerifyOptions = {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    };

    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, options) as jwt.JwtPayload;
    if (!decoded.sub || !decoded.sessionId || !decoded.tokenId) {
      throw new AppError("Invalid refresh token claims", 401);
    }

    return {
      sub: decoded.sub,
      sessionId: decoded.sessionId,
      tokenId: decoded.tokenId,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Refresh token has expired", 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError("Invalid refresh token", 401);
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Refresh token verification failed", 401);
  }
};
