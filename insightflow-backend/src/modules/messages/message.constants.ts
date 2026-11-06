export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const MESSAGE_ROLES = Object.values(MessageRole);

export const MessageStatus = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const MESSAGE_STATUSES = Object.values(MessageStatus);
