import mongoose, { Schema } from "mongoose";
import type { IConversationDocument } from "./conversation.types.js";
import { CONVERSATION_STATUSES, ConversationStatus } from "./conversation.constants.js";

const conversationSchema = new Schema<IConversationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    title: {
      type: String,
      required: [true, "Conversation title is required"],
      trim: true,
      maxlength: [300, "Title cannot exceed 300 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: undefined,
    },
    documentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Document" }],
      default: [],
      validate: {
        validator: function (ids: mongoose.Types.ObjectId[]) {
          return ids.length <= 50;
        },
        message: "A conversation cannot reference more than 50 documents",
      },
    },
    status: {
      type: String,
      enum: {
        values: CONVERSATION_STATUSES,
        message: "Invalid conversation status: {VALUE}",
      },
      default: ConversationStatus.ACTIVE,
    },
    lastMessageAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: "conversations",
  }
);

// Indexes
conversationSchema.index({ userId: 1, lastMessageAt: -1 });
conversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation = mongoose.model<IConversationDocument>(
  "Conversation",
  conversationSchema
);
