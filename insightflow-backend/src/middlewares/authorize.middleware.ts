import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../modules/users/user.constants.js";
import { AppError } from "../utils/app-error.util.js";

/**
 * Role-based authorization middleware.
 * Ensures the authenticated user has at least one of the specified allowed roles.
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError("Forbidden: Insufficient permissions for this resource", 403));
    }

    next();
  };
};
