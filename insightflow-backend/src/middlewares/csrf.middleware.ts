import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.util.js";

/**
 * Validates request origin and headers on cookie-authenticated state-changing routes
 * to prevent Cross-Site Request Forgery (CSRF).
 */
export const validateCsrfProtection = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Safe HTTP methods don't mutate state
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const originHeader = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);

  // In test environment, skip if explicitly bypassed or origin matches
  if (env.NODE_ENV === "test" && !originHeader) {
    return next();
  }

  if (originHeader) {
    const allowedOrigin = new URL(env.FRONTEND_URL).origin;
    if (originHeader !== allowedOrigin) {
      return next(new AppError("Cross-Site Request Forgery (CSRF) protection rejected untrusted origin", 403));
    }
  }

  // Also verify custom client header or content-type to ensure non-simple request
  const customHeader = req.headers["x-requested-with"] || req.headers["x-insightflow-client"];
  const contentType = req.headers["content-type"];

  // Browsers cannot send application/json cross-site without CORS preflight
  const isJson = contentType && contentType.includes("application/json");

  if (!customHeader && !isJson && !originHeader) {
    return next(new AppError("Missing anti-CSRF request validation header or origin", 403));
  }

  next();
};
