import type { Document, Types, Model } from "mongoose";
import type { MessageRole, MessageStatus } from "./message.constants.js";

export interface Citation {
  documentId: Types.ObjectId;
  chunkId: Types.ObjectId;
  content: string;
  pageNumber?: number;
  relevanceScore?: number;
}

export interface Attachment {
  documentId: Types.ObjectId;
  fileName: string;
  mimeType: string;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MessageRole;
  content: string;
  citations: Citation[];
  attachments: Attachment[];
  model?: string;
  tokenUsage?: TokenUsage;
  processingTime?: number;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Schema-level interface omits `model` to avoid conflict with Document.model() method */
export interface IMessageSchemaFields extends Omit<IMessage, "_id" | "model"> {
  model?: string;
}

export interface IMessageDocument extends Omit<IMessage, "_id" | "model">, Document {}
