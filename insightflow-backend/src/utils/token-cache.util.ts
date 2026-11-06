/**
 * In-memory TTL cache for revoked sessions.
 * Holds revoked session IDs for the duration of the maximum access token lifetime (default 15 minutes).
 * Once an access token expires naturally, the session ID is cleaned up from memory.
 */
class RevokedSessionRegistry {
  private revokedSessions = new Map<string, number>();
  private defaultTtlMs = 15 * 60 * 1000; // 15 minutes

  /**
   * Mark a session ID as revoked with a TTL.
   */
  public revoke(sessionId: string, ttlMs: number = this.defaultTtlMs): void {
    const expiresAt = Date.now() + ttlMs;
    this.revokedSessions.set(sessionId, expiresAt);
  }

  /**
   * Checks if a session ID has been revoked and the revocation window is still active.
   */
  public isRevoked(sessionId: string): boolean {
    const expiresAt = this.revokedSessions.get(sessionId);
    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.revokedSessions.delete(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Cleans up expired entries periodically.
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [sessionId, expiresAt] of this.revokedSessions.entries()) {
      if (now > expiresAt) {
        this.revokedSessions.delete(sessionId);
      }
    }
  }

  /**
   * Reset the registry (useful for testing).
   */
  public clear(): void {
    this.revokedSessions.clear();
  }
}

export const revokedSessionRegistry = new RevokedSessionRegistry();
