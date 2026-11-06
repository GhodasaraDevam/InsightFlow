import { Router } from "express";
import multer from "multer";
import { documentController } from "./document.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { uploadRateLimiter } from "../../middlewares/rate-limit.middleware.js";
import { env } from "../../config/env.js";

const router = Router();

// Configure Multer in-memory storage with strict limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
});

/**
 * All document operations require authentication.
 */
router.use(authenticate);

/**
 * @route   POST /api/v1/documents/upload
 * @desc    Upload a single document (PDF or DOCX) to Cloudinary authenticated storage
 * @access  Private
 */
router.post(
  "/upload",
  uploadRateLimiter,
  upload.single("file"),
  documentController.upload
);

/**
 * @route   GET /api/v1/documents
 * @desc    List paginated documents for the authenticated user
 * @access  Private
 */
router.get("/", documentController.list);

/**
 * @route   GET /api/v1/documents/:id
 * @desc    Get document details and safe metadata by ID
 * @access  Private
 */
router.get("/:id", documentController.getById);

/**
 * @route   GET /api/v1/documents/:id/download
 * @desc    Generate a temporary signed Cloudinary download URL for an owned document
 * @access  Private
 */
router.get("/:id/download", documentController.download);

/**
 * @route   DELETE /api/v1/documents/:id
 * @desc    Delete Cloudinary asset and soft-delete document in MongoDB
 * @access  Private
 */
router.delete("/:id", documentController.delete);

export default router;

