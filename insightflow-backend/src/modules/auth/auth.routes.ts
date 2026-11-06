import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { validateCsrfProtection } from "../../middlewares/csrf.middleware.js";
import {
  authRateLimiter,
  refreshRateLimiter,
} from "../../middlewares/rate-limit.middleware.js";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  (req, res, next) => authController.register(req, res, next)
);

router.post(
  "/login",
  authRateLimiter,
  (req, res, next) => authController.login(req, res, next)
);

router.post(
  "/refresh",
  refreshRateLimiter,
  validateCsrfProtection,
  (req, res, next) => authController.refresh(req, res, next)
);

router.post(
  "/logout",
  authenticate,
  validateCsrfProtection,
  (req, res, next) => authController.logout(req, res, next)
);

router.post(
  "/logout-all",
  authenticate,
  validateCsrfProtection,
  (req, res, next) => authController.logoutAll(req, res, next)
);

export default router;
