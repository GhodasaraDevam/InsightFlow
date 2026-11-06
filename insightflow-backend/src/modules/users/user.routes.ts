import { Router } from "express";
import { userController } from "./user.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get("/me", (req, res, next) => userController.getProfile(req, res, next));
router.patch("/me", (req, res, next) => userController.updateProfile(req, res, next));
router.post("/change-password", (req, res, next) => userController.changePassword(req, res, next));
router.patch("/me/password", (req, res, next) => userController.changePassword(req, res, next));

export default router;
