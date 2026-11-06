import crypto from "node:crypto";
import { Types } from "mongoose";
import { DocumentModel } from "./document.model.js";
import { ProcessingStatus, StorageProvider } from "./document.constants.js";
import type { IDocumentDocument } from "./document.types.js";
import { ProcessingJob } from "../processing-jobs/processing-job.model.js";
import { JobType, JobStatus, DEFAULT_MAX_ATTEMPTS } from "../processing-jobs/processing-job.constants.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import {
  validateDocumentFile,
  type ListDocumentsQuery,
} from "./document.validator.js";
import { AppError } from "../../utils/app-error.util.js";
import { isValidObjectId } from "../../utils/objectid.util.js";

export interface SafeDocumentResponse {
  id: string;
  originalName: string;
  displayName: string;
  mimeType: string;
  extension: string;
  fileSize: number;
  storageProvider: string;
  checksum?: string;
  processingStatus: string;
  processingError?: string;
  pageCount?: number;
  wordCount?: number;
  characterCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedDocumentsResponse {
  documents: SafeDocumentResponse[];
  pagination: {
    page: number;
    limit: number;
    totalDocuments: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

const toSafeDocument = (doc: IDocumentDocument | (Record<string, unknown> & { _id: Types.ObjectId })): SafeDocumentResponse => {
  return {
    id: doc._id.toString(),
    originalName: doc.originalName as string,
    displayName: doc.displayName as string,
    mimeType: doc.mimeType as string,
    extension: doc.extension as string,
    fileSize: doc.fileSize as number,
    storageProvider: doc.storageProvider as string,
    checksum: doc.checksum as string | undefined,
    processingStatus: doc.processingStatus as string,
    processingError: doc.processingError as string | undefined,
    pageCount: doc.pageCount as number | undefined,
    wordCount: doc.wordCount as number | undefined,
    characterCount: doc.characterCount as number | undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
};

export class DocumentService {
  /**
   * Uploads a document:
   * 1. Validates content and mime structure.
   * 2. Uploads raw authenticated asset to Cloudinary.
   * 3. Persists document metadata to MongoDB Atlas.
   * 4. Enqueues a full_processing job.
   * 5. Performs Cloudinary rollback if MongoDB persistence fails.
   */
  public async uploadDocument(
    userId: string,
    file?: Express.Multer.File
  ): Promise<SafeDocumentResponse> {
    const validated = validateDocumentFile(file);

    // Generate SHA-256 checksum
    const checksum = crypto
      .createHash("sha256")
      .update(validated.buffer)
      .digest("hex");

    // Server-controlled unique public identifier
    const uniqueId = crypto.randomUUID();
    const serverPublicId = `${uniqueId}${validated.extension}`;

    // 1. Upload to Cloudinary authenticated raw storage
    const uploadResult = await cloudinaryService.uploadDocument(validated.buffer, {
      publicId: serverPublicId,
      filename: validated.originalName,
    });

    let documentDoc: IDocumentDocument;

    // 2. Persist in MongoDB with safe rollback on failure
    try {
      documentDoc = await DocumentModel.create({
        userId: new Types.ObjectId(userId),
        originalName: validated.originalName,
        displayName: validated.displayName,
        mimeType: validated.mimeType,
        extension: validated.extension,
        fileSize: validated.fileSize,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: uploadResult.publicId,
        storagePath: uploadResult.secureUrl,
        checksum,
        processingStatus: ProcessingStatus.UPLOADED,
        metadata: {
          cloudinary: {
            assetId: uploadResult.assetId,
            publicId: uploadResult.publicId,
            resourceType: uploadResult.resourceType,
            deliveryType: uploadResult.deliveryType,
            format: uploadResult.format,
            bytes: uploadResult.bytes,
            version: uploadResult.version,
          },
        },
      });
    } catch (persistenceError) {
      console.error(
        "[DocumentService.uploadDocument] MongoDB persistence failed. Rolling back Cloudinary asset:",
        {
          publicId: uploadResult.publicId,
          error: (persistenceError as Error)?.message,
        }
      );

      // Attempt cleanup
      try {
        await cloudinaryService.deleteAsset(uploadResult.publicId);
      } catch (cleanupError) {
        console.error(
          "[CRITICAL RECONCILIATION ERROR] Failed to delete orphaned Cloudinary asset during rollback:",
          {
            publicId: uploadResult.publicId,
            assetId: uploadResult.assetId,
            error: (cleanupError as Error)?.message,
          }
        );
      }

      throw new AppError("Failed to persist document metadata", 500);
    }

    // 3. Queue full processing job
    try {
      await ProcessingJob.create({
        userId: new Types.ObjectId(userId),
        documentId: documentDoc._id,
        jobType: JobType.FULL_PROCESSING,
        status: JobStatus.QUEUED,
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        progress: 0,
      });

      // Update processing status to QUEUED
      documentDoc.processingStatus = ProcessingStatus.QUEUED;
      await documentDoc.save();
    } catch (jobError) {
      console.error(
        "[DocumentService.uploadDocument] Processing job enqueue warning (document remains uploaded):",
        {
          documentId: documentDoc._id.toString(),
          error: (jobError as Error)?.message,
        }
      );
    }

    return toSafeDocument(documentDoc);
  }

  /**
   * Retrieves paginated, sorted list of documents for the authenticated user.
   */
  public async listDocuments(
    userId: string,
    query: ListDocumentsQuery
  ): Promise<PaginatedDocumentsResponse> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    };

    if (query.status) {
      filter.processingStatus = query.status;
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const sortField = query.sortBy || "createdAt";
    const sortDirection = query.sortOrder === "asc" ? 1 : -1;

    const [totalDocuments, documents] = await Promise.all([
      DocumentModel.countDocuments(filter),
      DocumentModel.find(filter)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(totalDocuments / limit) || 1;

    return {
      documents: documents.map((doc) => toSafeDocument(doc)),
      pagination: {
        page,
        limit,
        totalDocuments,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves safe document metadata for a document owned by the user.
   */
  public async getDocumentById(
    userId: string,
    documentId: string
  ): Promise<SafeDocumentResponse> {
    if (!isValidObjectId(documentId)) {
      throw new AppError("Invalid document ID format", 400);
    }

    const document = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    }).lean();

    if (!document) {
      throw new AppError("Document not found", 404);
    }

    return toSafeDocument(document);
  }

  /**
   * Generates a short-lived authorized signed download URL for an owned document.
   */
  public async generateDownloadUrl(
    userId: string,
    documentId: string
  ): Promise<{ downloadUrl: string; expiresAt: Date; expiresInSeconds: number }> {
    if (!isValidObjectId(documentId)) {
      throw new AppError("Invalid document ID format", 400);
    }

    const document = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!document) {
      throw new AppError("Document not found", 404);
    }

    if (!document.storageKey) {
      throw new AppError("Document storage reference is missing", 404);
    }

    const format = document.extension.replace(/^\./, "");
    return cloudinaryService.generateDownloadUrl(document.storageKey, format);
  }

  /**
   * Deletes a document:
   * 1. Confirms ownership and active state.
   * 2. Destroys the asset in Cloudinary.
   * 3. Soft-deletes document in MongoDB.
   */
  public async deleteDocument(
    userId: string,
    documentId: string
  ): Promise<{ id: string; isDeleted: boolean }> {
    if (!isValidObjectId(documentId)) {
      throw new AppError("Invalid document ID format", 400);
    }

    const document = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      userId: new Types.ObjectId(userId),
    });

    if (!document || document.isDeleted) {
      throw new AppError("Document not found", 404);
    }

    // 1. Delete asset from Cloudinary
    await cloudinaryService.deleteAsset(document.storageKey);

    // 2. Soft delete in MongoDB
    document.isDeleted = true;
    document.deletedAt = new Date();
    await document.save();

    return {
      id: document._id.toString(),
      isDeleted: true,
    };
  }
}

export const documentService = new DocumentService();

