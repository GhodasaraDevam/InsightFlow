import mongoose, { Schema } from "mongoose";
import type { IDocumentChunkDocument } from "./document-chunk.types.js";

const chunkMetadataSchema = new Schema(
  {
    pageNumber: { type: Number },
    section: { type: String },
    heading: { type: String },
  },
  { _id: false, strict: false }
);

const documentChunkSchema = new Schema<IDocumentChunkDocument>(
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
    chunkIndex: {
      type: Number,
      required: [true, "Chunk index is required"],
      min: [0, "Chunk index cannot be negative"],
    },
    content: {
      type: String,
      required: [true, "Chunk content is required"],
    },
    tokenCount: {
      type: Number,
      min: [0, "Token count cannot be negative"],
      default: undefined,
    },
    characterCount: {
      type: Number,
      min: [0, "Character count cannot be negative"],
      default: undefined,
    },
    pageNumber: {
      type: Number,
      min: [1, "Page number must be at least 1"],
      default: undefined,
    },
    startOffset: {
      type: Number,
      min: [0, "Start offset cannot be negative"],
      default: undefined,
    },
    endOffset: {
      type: Number,
      min: [0, "End offset cannot be negative"],
      default: undefined,
    },
    embedding: {
      type: [Number],
      select: false,
      default: undefined,
    },
    embeddingModel: {
      type: String,
      default: undefined,
    },
    embeddingDimensions: {
      type: Number,
      min: [1, "Embedding dimensions must be at least 1"],
      default: undefined,
    },
    metadata: {
      type: chunkMetadataSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: "document_chunks",
  }
);

// Unique compound index: one chunk index per document
documentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

// Query chunks by user and document (for ownership verification)
documentChunkSchema.index({ userId: 1, documentId: 1 });

/**
 * FUTURE: MongoDB Atlas Vector Search Index
 *
 * Once an embedding model is selected and dimensions are confirmed,
 * create a vector search index via Atlas UI or API:
 *
 * {
 *   "type": "vectorSearch",
 *   "definition": {
 *     "fields": [
 *       {
 *         "type": "vector",
 *         "path": "embedding",
 *         "numDimensions": <EMBEDDING_DIMENSIONS>,
 *         "similarity": "cosine"
 *       },
 *       {
 *         "type": "filter",
 *         "path": "userId"
 *       },
 *       {
 *         "type": "filter",
 *         "path": "documentId"
 *       }
 *     ]
 *   }
 * }
 *
 * This index CANNOT be created via Mongoose — it must be created
 * through the Atlas UI, Atlas Admin API, or the MongoDB CLI (mongosh).
 */

export const DocumentChunk = mongoose.model<IDocumentChunkDocument>(
  "DocumentChunk",
  documentChunkSchema
);
