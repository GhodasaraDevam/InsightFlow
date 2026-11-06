export const JobType = {
  TEXT_EXTRACTION: "text_extraction",
  CHUNKING: "chunking",
  EMBEDDING: "embedding",
  FULL_PROCESSING: "full_processing",
} as const;

export type JobType = (typeof JobType)[keyof typeof JobType];

export const JOB_TYPES = Object.values(JobType);

export const JobStatus = {
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JOB_STATUSES = Object.values(JobStatus);

/** Default maximum retry attempts */
export const DEFAULT_MAX_ATTEMPTS = 3;
