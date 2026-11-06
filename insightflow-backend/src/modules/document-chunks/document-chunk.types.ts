import type { Document, Types } from "mongoose";

export interface ChunkMetadata {
  pageNumber?: number;
  section?: string;
  heading?: string;
  [key: string]: unknown;
}

export interface IDocumentChunk {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkIndex: number;
  content: string;
  tokenCount?: number;
  characterCount?: number;
  pageNumber?: number;
  startOffset?: number;
  endOffset?: number;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  metadata: ChunkMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDocumentChunkDocument extends Omit<IDocumentChunk, "_id">, Document {}
