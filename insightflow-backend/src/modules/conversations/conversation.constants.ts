export const ConversationStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

export type ConversationStatus =
  (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const CONVERSATION_STATUSES = Object.values(ConversationStatus);
