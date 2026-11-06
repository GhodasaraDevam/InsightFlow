import type { Request, Response, NextFunction } from "express";
import { userService } from "./user.service.js";
import { updateProfileSchema, changePasswordSchema } from "./user.validator.js";
import { clearRefreshCookie } from "../../utils/cookie.util.js";
import { AppError } from "../../utils/app-error.util.js";

export class UserController {
  public async getProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const profile = await userService.getProfile(userId);

      res.status(200).json({
        success: true,
        message: "Profile retrieved successfully",
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const validatedInput = updateProfileSchema.parse(req.body);
      const updatedProfile = await userService.updateProfile(userId, validatedInput);

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  public async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const validatedInput = changePasswordSchema.parse(req.body);
      await userService.changePassword(userId, validatedInput);

      // Clear refresh cookie since all sessions have been revoked
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: "Password changed successfully. All other sessions have been revoked. Please log in again.",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
