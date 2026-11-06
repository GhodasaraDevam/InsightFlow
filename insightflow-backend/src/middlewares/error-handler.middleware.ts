import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error.util.js";
import { env } from "../config/env.js";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Operational AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors || [],
    });
    return;
  }

  // Zod schema validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formattedErrors,
    });
    return;
  }

  // JSON parse error in body parser
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      message: "Malformed JSON payload in request body",
      errors: [{ message: err.message }],
    });
    return;
  }

  // Mongoose duplicate key error (code 11000)
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000) {
    const keyPattern = (err as { keyPattern?: Record<string, number> }).keyPattern;
    const field = keyPattern ? Object.keys(keyPattern)[0] : "field";
    res.status(409).json({
      success: false,
      message: `${field === "email" ? "Email" : field} is already in use`,
      errors: [{ field, message: `${field} already exists` }],
    });
    return;
  }

  // Internal unhandled errors
  console.error("Unhandled error:", err);

  const message = env.NODE_ENV === "production" ? "Internal server error" : (err as Error)?.message || "Internal server error";

  res.status(500).json({
    success: false,
    message,
    errors: [],
  });
};
