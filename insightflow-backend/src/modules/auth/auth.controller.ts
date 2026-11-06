import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema } from "./auth.validator.js";
import {
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
} from "../../utils/cookie.util.js";
import { AppError } from "../../utils/app-error.util.js";

export class AuthController {
  public async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validatedInput = registerSchema.parse(req.body);
      const result = await authService.register(validatedInput);

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validatedInput = loginSchema.parse(req.body);
      const clientInfo = {
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      };

      const result = await authService.login(validatedInput, clientInfo);

      // Set secure HttpOnly cookie for refresh token
      setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (!refreshToken) {
        throw new AppError("Refresh token cookie is missing", 401);
      }

      const clientInfo = {
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      };

      const result = await authService.refresh(refreshToken, clientInfo);

      // Set new rotated refresh token in HttpOnly cookie
      setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sessionId = req.user?.sessionId || req.sessionId;
      if (sessionId) {
        await authService.logout(sessionId);
      }

      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  public async logoutAll(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      await authService.logoutAll(userId);
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: "Logged out from all devices successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
