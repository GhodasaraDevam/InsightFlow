import mongoose, { Schema } from "mongoose";
import type { IDocumentDocument } from "./document.types.js";
import {
  PROCESSING_STATUSES,
  STORAGE_PROVIDERS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  ProcessingStatus,
  StorageProvider,
} from "./document.constants.js";

const documentMetadataSchema = new Schema(
  {
    title: { type: String },
    author: { type: String },
    subject: { type: String },
    language: { type: String },
  },
  { _id: false, strict: false }
);

const documentSchema = new Schema<IDocumentDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    originalName: {
      type: String,
      required: [true, "Original file name is required"],
      trim: true,
      maxlength: [500, "File name cannot exceed 500 characters"],
    },
    displayName: {
      type: String,
      required: [true, "Display name is required"],
      trim: true,
      maxlength: [500, "Display name cannot exceed 500 characters"],
    },
    mimeType: {
      type: String,
      required: [true, "MIME type is required"],
      enum: {
        values: ALLOWED_MIME_TYPES,
        message: "Unsupported file type: {VALUE}",
      },
    },
    extension: {
      type: String,
      required: [true, "File extension is required"],
      enum: {
        values: ALLOWED_EXTENSIONS,
        message: "Unsupported file extension: {VALUE}",
      },
    },
    fileSize: {
      type: Number,
      required: [true, "File size is required"],
      min: [1, "File size must be at least 1 byte"],
      max: [MAX_FILE_SIZE_BYTES, `File size cannot exceed ${MAX_FILE_SIZE_BYTES} bytes`],
    },
    storageProvider: {
      type: String,
      enum: {
        values: STORAGE_PROVIDERS,
        message: "Invalid storage provider: {VALUE}",
      },
      default: StorageProvider.LOCAL,
    },
    storageKey: {
      type: String,
      required: [true, "Storage key is required"],
    },
    storagePath: {
      type: String,
      required: [true, "Storage path is required"],
    },
    checksum: {
      type: String,
      default: undefined,
    },
    pageCount: {
      type: Number,
      min: [0, "Page count cannot be negative"],
      default: undefined,
    },
    wordCount: {
      type: Number,
      min: [0, "Word count cannot be negative"],
      default: undefined,
    },
    characterCount: {
      type: Number,
      min: [0, "Character count cannot be negative"],
      default: undefined,
    },
    processingStatus: {
      type: String,
      enum: {
        values: PROCESSING_STATUSES,
        message: "Invalid processing status: {VALUE}",
      },
      default: ProcessingStatus.UPLOADED,
    },
    processingError: {
      type: String,
      default: undefined,
    },
    processingCompletedAt: {
      type: Date,
      default: undefined,
    },
    metadata: {
      type: documentMetadataSchema,
      default: () => ({}),
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: "documents",
  }
);

// Indexes for efficient querying
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ userId: 1, processingStatus: 1 });
documentSchema.index({ userId: 1, updatedAt: -1 });

// Default filter: exclude soft-deleted documents
documentSchema.pre("find", function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

documentSchema.pre("findOne", function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

documentSchema.pre("countDocuments", function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

export const DocumentModel = mongoose.model<IDocumentDocument>("Document", documentSchema);
