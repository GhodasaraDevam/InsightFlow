import type { Document, Types } from "mongoose";
import type { JobType, JobStatus } from "./processing-job.constants.js";

export interface IProcessingJob {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  documentId: Types.ObjectId;
  jobType: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  progress: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProcessingJobDocument extends Omit<IProcessingJob, "_id">, Document {}
