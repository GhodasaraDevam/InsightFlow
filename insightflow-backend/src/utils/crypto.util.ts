import crypto from "node:crypto";

/**
 * Computes a SHA-256 hex digest for high-entropy tokens before storage.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generates a cryptographically secure UUID v4 for token identification.
 */
export const generateSecureTokenId = (): string => {
  return crypto.randomUUID();
};
