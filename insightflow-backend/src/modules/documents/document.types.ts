import type { Document, Types } from "mongoose";
import type { ProcessingStatus, StorageProvider, AllowedMimeType } from "./document.constants.js";

export interface CloudinaryAssetMetadata {
  assetId?: string;
  publicId?: string;
  resourceType?: string;
  deliveryType?: string;
  format?: string;
  bytes?: number;
  version?: number;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  language?: string;
  cloudinary?: CloudinaryAssetMetadata;
  [key: string]: unknown;
}

export interface IDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  originalName: string;
  displayName: string;
  mimeType: AllowedMimeType;
  extension: string;
  fileSize: number;
  storageProvider: StorageProvider;
  storageKey: string;
  storagePath: string;
  checksum?: string;
  pageCount?: number;
  wordCount?: number;
  characterCount?: number;
  processingStatus: ProcessingStatus;
  processingError?: string;
  processingCompletedAt?: Date;
  metadata: DocumentMetadata;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDocumentDocument extends Omit<IDocument, "_id">, Document {}
