import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * Strict rate limiter for sensitive authentication endpoints (login, register).
 * Limits to 10 requests per 15 minutes per IP in production/development.
 * Skipped in test environment to allow automated test suites to run.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please wait a few minutes before trying again.",
      errors: [
        {
          field: "rateLimit",
          message: "Rate limit exceeded. Try again in 15 minutes.",
        },
      ],
    });
  },
});

/**
 * Moderate rate limiter for token refresh attempts.
 * Limits to 30 requests per 15 minutes per IP in production/development.
 * Skipped in test environment to allow automated test suites to run.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: "Too many refresh attempts. Please slow down.",
      errors: [
        {
          field: "rateLimit",
          message: "Refresh rate limit exceeded.",
        },
      ],
    });
  },
});

/**
 * Rate limiter for document uploads to prevent abuse and denial of service.
 * Allows up to 20 uploads per 15 minutes per IP.
 * Skipped in test environment.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: "Upload rate limit exceeded. Please wait a few minutes before uploading again.",
      errors: [
        {
          field: "rateLimit",
          message: "Too many file upload requests.",
        },
      ],
    });
  },
});
