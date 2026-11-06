import { Readable } from "node:stream";
import { cloudinary, CLOUDINARY_CONFIG } from "../config/cloudinary.js";
import { AppError } from "../utils/app-error.util.js";

export interface SafeCloudinaryUploadResult {
  assetId: string;
  publicId: string;
  resourceType: string;
  deliveryType: string;
  format: string;
  bytes: number;
  version: number;
  secureUrl: string;
}

export interface TemporaryDownloadUrlResult {
  downloadUrl: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

export class CloudinaryService {
  /**
   * Uploads a document buffer to Cloudinary using authenticated raw delivery.
   */
  public async uploadDocument(
    buffer: Buffer,
    options: {
      publicId: string;
      filename?: string;
    }
  ): Promise<SafeCloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_CONFIG.FOLDER,
          resource_type: CLOUDINARY_CONFIG.RESOURCE_TYPE,
          type: CLOUDINARY_CONFIG.DELIVERY_TYPE,
          public_id: options.publicId,
          use_filename: false,
          unique_filename: false,
          overwrite: true,
        },
        (error, result) => {
          if (error || !result) {
            console.error("[CloudinaryService.uploadDocument] Upload failed:", {
              message: error?.message || "Unknown Cloudinary error",
              publicId: options.publicId,
            });
            return reject(
              new AppError(
                "Failed to upload document to storage provider",
                502
              )
            );
          }

          resolve({
            assetId: result.asset_id,
            publicId: result.public_id,
            resourceType: result.resource_type,
            deliveryType: result.type,
            format: result.format || "",
            bytes: result.bytes,
            version: result.version,
            secureUrl: result.secure_url,
          });
        }
      );

      const readableStream = new Readable({
        read() {
          this.push(buffer);
          this.push(null);
        },
      });

      readableStream.pipe(uploadStream);
    });
  }

  /**
   * Generates a temporary authorized signed download URL for an authenticated asset.
   * Uses Cloudinary SDK's supported private_download_url with short expiration.
   */
  public generateDownloadUrl(
    publicId: string,
    format?: string,
    expiresInSeconds: number = CLOUDINARY_CONFIG.DEFAULT_DOWNLOAD_EXPIRATION_SECONDS
  ): TemporaryDownloadUrlResult {
    try {
      const expiresAtTimestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;

      // If the publicId already contains the extension (e.g. .pdf or .docx),
      // avoid passing a redundant format parameter that could cause duplicate extensions in Cloudinary.
      const hasExtension = format && publicId.toLowerCase().endsWith(`.${format.toLowerCase()}`);
      const formatToPass = hasExtension ? "" : format || "";

      const downloadUrl = cloudinary.utils.private_download_url(
        publicId,
        formatToPass,
        {
          resource_type: CLOUDINARY_CONFIG.RESOURCE_TYPE,
          type: CLOUDINARY_CONFIG.DELIVERY_TYPE,
          expires_at: expiresAtTimestamp,
        }
      );

      if (!downloadUrl) {
        throw new Error("Cloudinary returned empty download URL");
      }

      return {
        downloadUrl,
        expiresAt: new Date(expiresAtTimestamp * 1000),
        expiresInSeconds,
      };
    } catch (error) {
      console.error("[CloudinaryService.generateDownloadUrl] Failed to generate signed URL:", {
        publicId,
        message: (error as Error)?.message,
      });
      throw new AppError("Failed to generate secure document download URL", 500);
    }
  }

  /**
   * Deletes an authenticated asset from Cloudinary storage.
   */
  public async deleteAsset(
    publicId: string,
    options?: {
      resourceType?: string;
      deliveryType?: string;
    }
  ): Promise<{ success: boolean; result: string }> {
    try {
      const response = await cloudinary.uploader.destroy(publicId, {
        resource_type: options?.resourceType || CLOUDINARY_CONFIG.RESOURCE_TYPE,
        type: options?.deliveryType || CLOUDINARY_CONFIG.DELIVERY_TYPE,
        invalidate: true,
      });

      // Cloudinary destroy returns { result: "ok" } or { result: "not found" }
      if (response.result === "ok" || response.result === "not found") {
        return {
          success: true,
          result: response.result,
        };
      }

      console.error("[CloudinaryService.deleteAsset] Cloudinary deletion unconfirmed:", {
        publicId,
        result: response.result,
      });
      throw new AppError(
        `Failed to remove document from storage: ${response.result}`,
        502
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error("[CloudinaryService.deleteAsset] Cloudinary destruction error:", {
        publicId,
        message: (error as Error)?.message,
      });
      throw new AppError("Failed to remove document from storage provider", 502);
    }
  }
}

export const cloudinaryService = new CloudinaryService();

