import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";

/**
 * Centralized Cloudinary SDK configuration.
 * Uses secure HTTPS delivery and authenticated raw storage for document privacy.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const CLOUDINARY_CONFIG = {
  FOLDER: "insightflow/documents",
  RESOURCE_TYPE: "raw" as const,
  DELIVERY_TYPE: "authenticated" as const,
  DEFAULT_DOWNLOAD_EXPIRATION_SECONDS: 300, // 5 minutes
};

/**
 * Checks whether live Cloudinary credentials are configured with non-placeholder values.
 */
export const isCloudinaryConfigured = (): boolean => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return false;
  }
  const placeholders = [
    "test_cloud_name",
    "placeholder_cloud_name",
    "your_cloud_name",
    "test_api_key",
    "placeholder_api_key",
    "test_api_secret",
    "placeholder_api_secret",
  ];
  return (
    !placeholders.includes(CLOUDINARY_CLOUD_NAME) &&
    !placeholders.includes(CLOUDINARY_API_KEY) &&
    !placeholders.includes(CLOUDINARY_API_SECRET)
  );
};

export { cloudinary };

