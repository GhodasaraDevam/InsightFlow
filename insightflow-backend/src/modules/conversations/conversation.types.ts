import type { Document, Types } from "mongoose";
import type { ConversationStatus } from "./conversation.constants.js";

export interface IConversation {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  description?: string;
  documentIds: Types.ObjectId[];
  status: ConversationStatus;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationDocument extends Omit<IConversation, "_id">, Document {}
