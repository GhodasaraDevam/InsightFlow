import mongoose, { Schema } from "mongoose";
import type { IMessageDocument, IMessageSchemaFields } from "./message.types.js";
import { MESSAGE_ROLES, MESSAGE_STATUSES, MessageRole, MessageStatus } from "./message.constants.js";

const citationSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentChunk",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    pageNumber: {
      type: Number,
      min: 1,
    },
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  { _id: false }
);

const attachmentSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const tokenUsageSchema = new Schema(
  {
    promptTokens: { type: Number, min: 0 },
    completionTokens: { type: Number, min: 0 },
    totalTokens: { type: Number, min: 0 },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessageSchemaFields>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "Conversation ID is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    role: {
      type: String,
      enum: {
        values: MESSAGE_ROLES,
        message: "Invalid message role: {VALUE}",
      },
      required: [true, "Message role is required"],
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      maxlength: [50000, "Message content cannot exceed 50,000 characters"],
    },
    citations: {
      type: [citationSchema],
      default: [],
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    model: {
      type: String,
      default: undefined,
    },
    tokenUsage: {
      type: tokenUsageSchema,
      default: undefined,
    },
    processingTime: {
      type: Number,
      min: [0, "Processing time cannot be negative"],
      default: undefined,
    },
    status: {
      type: String,
      enum: {
        values: MESSAGE_STATUSES,
        message: "Invalid message status: {VALUE}",
      },
      default: MessageStatus.COMPLETED,
    },
  },
  {
    timestamps: true,
    collection: "messages",
  }
);

// Indexes for pagination and querying
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ userId: 1, createdAt: -1 });

export const Message = mongoose.model<IMessageSchemaFields>("Message", messageSchema);
