export const ProcessingStatus = {
  UPLOADED: "uploaded",
  QUEUED: "queued",
  PROCESSING: "processing",
  EXTRACTING: "extracting",
  CHUNKING: "chunking",
  EMBEDDING: "embedding",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type ProcessingStatus = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

export const PROCESSING_STATUSES = Object.values(ProcessingStatus);

export const StorageProvider = {
  LOCAL: "local",
  GCS: "gcs",
  S3: "s3",
} as const;

export type StorageProvider = (typeof StorageProvider)[keyof typeof StorageProvider];

export const STORAGE_PROVIDERS = Object.values(StorageProvider);

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

/** Maximum file size in bytes (50 MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
