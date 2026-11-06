import mongoose, { Schema } from "mongoose";
import type { IProcessingJobDocument } from "./processing-job.types.js";
import {
  JOB_TYPES,
  JOB_STATUSES,
  JobStatus,
  DEFAULT_MAX_ATTEMPTS,
} from "./processing-job.constants.js";

const processingJobSchema = new Schema<IProcessingJobDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: [true, "Document ID is required"],
    },
    jobType: {
      type: String,
      enum: {
        values: JOB_TYPES,
        message: "Invalid job type: {VALUE}",
      },
      required: [true, "Job type is required"],
    },
    status: {
      type: String,
      enum: {
        values: JOB_STATUSES,
        message: "Invalid job status: {VALUE}",
      },
      default: JobStatus.QUEUED,
    },
    attempts: {
      type: Number,
      default: 0,
      min: [0, "Attempts cannot be negative"],
    },
    maxAttempts: {
      type: Number,
      default: DEFAULT_MAX_ATTEMPTS,
      min: [1, "Max attempts must be at least 1"],
    },
    progress: {
      type: Number,
      default: 0,
      min: [0, "Progress cannot be negative"],
      max: [100, "Progress cannot exceed 100"],
    },
    errorMessage: {
      type: String,
      default: undefined,
    },
    startedAt: {
      type: Date,
      default: undefined,
    },
    completedAt: {
      type: Date,
      default: undefined,
    },
    nextRetryAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: "processing_jobs",
  }
);

// Indexes
processingJobSchema.index({ status: 1, createdAt: 1 });
processingJobSchema.index({ documentId: 1, jobType: 1 });
processingJobSchema.index({ userId: 1, createdAt: -1 });

export const ProcessingJob = mongoose.model<IProcessingJobDocument>(
  "ProcessingJob",
  processingJobSchema
);
