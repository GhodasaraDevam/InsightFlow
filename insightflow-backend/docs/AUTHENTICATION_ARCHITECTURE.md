# InsightFlow — Authentication & Authorization Architecture

> **Document Type:** Security & Architectural Specification
> **Milestone:** Milestone 2 — Complete Authentication & Authorization System
> **Audience:** Senior Backend Engineers, Security Auditors, Frontend Leads
> **Repository:** `InsightFlow/insightflow-backend`
> **Last Updated:** 2026-11-06

---

## 1. Architectural Overview

InsightFlow employs a defense-in-depth, token-pair authentication model designed for stateless scale and robust session security:

- **Access Token:** Short-lived JWT (~15 minutes) signed with `JWT_ACCESS_SECRET`. Stored exclusively in frontend application memory (never in `localStorage` or `sessionStorage`). Sent via `Authorization: Bearer <token>` header.
- **Refresh Token:** Long-lived JWT (~7 days) signed with `JWT_REFRESH_SECRET`. Stored in a secure `HttpOnly` cookie with path scoping (`/api/v1/auth`). Associated with a MongoDB `Session` document.
- **Refresh Token Rotation & Token-Family Strategy:** Every refresh request atomically rotates the refresh token, invalidating the previous one and recording its cryptographic SHA-256 hash in a bounded `consumedTokenHashes` family history.
- **Token Reuse Detection:** If an already-consumed refresh token is presented, the system detects a potential token replay/theft, revokes the entire session immediately, and alerts security audit logs.
- **Atomic Concurrency Handling:** Eliminates race conditions across concurrent refresh calls via MongoDB atomic find-and-modify operations without requiring multi-document distributed transactions.
- **Revocation & Invalidation Strategy:** Hybrid model pairing a User-level `tokenVersion` counter with an in-memory TTL `RevokedSessionRegistry` to instantly drop revoked sessions without hitting the database on every micro-request.
- **Email Verification Policy:** Documented non-blocking login policy for unverified accounts.

---

## 2. Sequence Diagrams

### 2.1 User Registration Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant API as Express Router
    participant Val as Zod Validator
    participant Svc as AuthService
    participant DB as MongoDB Atlas

    Client->>API: POST /api/v1/auth/register (fullName, email, password)
    API->>Val: Validate request body (email regex, password complexity)
    alt Validation Failure
        Val-->>API: ZodError (field details)
        API-->>Client: 400 Bad Request { success: false, errors }
    else Validation Success
        Val-->>Svc: Validated registration payload
        Svc->>DB: User.findOne({ email: normalizedEmail })
        alt Email Already Exists
            DB-->>Svc: Existing User Record
            Svc-->>API: AppError (409 Conflict)
            API-->>Client: 409 Conflict "Email already registered"
        else New User
            Svc->>Svc: Hash password with bcrypt (12 rounds)
            Svc->>DB: User.create({ role: 'user', accountStatus: 'active', isEmailVerified: false, ... })
            DB-->>Svc: Saved User Document
            Svc->>Svc: Strip passwordHash & internal fields
            Svc-->>API: SafeUser object
            API-->>Client: 201 Created { success: true, data: { user } }
        end
    end
```

---

### 2.2 User Login Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant Rate as RateLimiter
    participant API as Express Router
    participant Svc as AuthService
    participant DB as MongoDB Atlas

    Client->>Rate: POST /api/v1/auth/login (email, password)
    Rate->>API: Within rate limit (max 10 req / 15m)
    API->>Svc: login(credentials, clientInfo)
    Svc->>DB: User.findOne({ email }).select('+passwordHash +tokenVersion')
    alt User Not Found
        Svc->>Svc: Execute constant-time dummy bcrypt compare (prevents timing attacks)
        Svc-->>API: AppError (401 Unauthorized)
        API-->>Client: 401 Unauthorized "Invalid email or password"
    else User Found
        Svc->>Svc: bcrypt.compare(password, user.passwordHash)
        alt Password Mismatch
            Svc-->>API: AppError (401 Unauthorized)
            API-->>Client: 401 Unauthorized "Invalid email or password"
        else Password Valid
            alt Account Suspended or Deleted
                Svc-->>API: AppError (403 Forbidden)
                API-->>Client: 403 Forbidden "Account is suspended"
            else Account Active
                Svc->>DB: User.updateOne({ _id }, { lastLoginAt: now })
                Svc->>Svc: Generate Session ID & tokenId (UUIDv4)
                Svc->>Svc: Generate Refresh Token JWT (7d)
                Svc->>Svc: Compute SHA-256 hash of Refresh Token
                Svc->>DB: Session.create({ _id: sessionId, refreshTokenHash, expiresAt })
                Svc->>Svc: Generate Access Token JWT (15m, includes sessionId, role, tokenVersion)
                Svc-->>API: { user, accessToken, refreshToken }
                API->>API: setCookie('refreshToken', HttpOnly, SameSite, Path=/api/v1/auth)
                API-->>Client: 200 OK { success: true, data: { user, accessToken } }
            end
        end
    end
```

---

### 2.3 Atomic Refresh Token Rotation & Reuse Detection

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant CSRF as CSRF Middleware
    participant API as Express Router
    participant Svc as AuthService
    participant Reg as RevokedSessionRegistry
    participant DB as MongoDB Atlas

    Client->>CSRF: POST /api/v1/auth/refresh (Cookie: refreshToken=...)
    CSRF->>API: Origin / Custom Header verified
    API->>Svc: refresh(rawRefreshToken, clientInfo)
    Svc->>Svc: Verify JWT signature & claims (sessionId, tokenId)
    Svc->>Svc: Compute incomingTokenHash = SHA256(rawRefreshToken)
    Svc->>DB: Session.findById(sessionId).select('+refreshTokenHash +consumedTokenHashes')

    alt Session Not Found or Expired or Revoked
        Svc-->>API: AppError (401)
        API-->>Client: 401 Unauthorized "Session expired or revoked"
    else Token Reuse Detected (incomingTokenHash in consumedTokenHashes)
        Note over Svc,DB: SECURITY ALERT: Token was previously consumed!
        Svc->>DB: Session.updateOne({ _id: sessionId }, { revokedAt: now })
        Svc->>Reg: revoke(sessionId)
        Svc-->>API: AppError (401 Security Alert)
        API-->>Client: 401 Unauthorized "Token reuse detected. Session revoked."
    else Valid Current Token (Atomic Rotation)
        Svc->>Svc: Generate new tokenId, newRefreshToken, newRefreshTokenHash
        Svc->>DB: Session.findOneAndUpdate({ _id: sessionId, refreshTokenHash: incomingTokenHash, revokedAt: null }, { $set: { refreshTokenHash: newHash }, $push: { consumedTokenHashes: incomingTokenHash } }, { returnDocument: 'after' })
        alt Atomic Update Fails (Concurrent Refresh Collision)
            Svc->>DB: Check if token was just consumed concurrently
            Svc->>DB: Session.updateOne({ _id: sessionId }, { revokedAt: now })
            Svc-->>API: AppError (401 Conflict)
            API-->>Client: 401 Unauthorized "Concurrent refresh collision detected"
        else Atomic Update Succeeds
            Svc->>DB: User.findById(userId).select('role accountStatus tokenVersion')
            Svc->>Svc: Generate new Access Token JWT (15m)
            Svc-->>API: { accessToken, newRefreshToken }
            API->>API: setCookie('refreshToken', newRefreshToken, HttpOnly, SameSite)
            API-->>Client: 200 OK { success: true, data: { accessToken } }
        end
    end
```

---

### 2.4 Logout & Session Revocation

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant Auth as Authenticate Middleware
    participant API as Express Router
    participant Svc as AuthService
    participant Reg as RevokedSessionRegistry
    participant DB as MongoDB Atlas

    Client->>Auth: POST /api/v1/auth/logout (Bearer accessToken)
    Auth->>Auth: Verify JWT & extract sessionId
    Auth->>API: req.user = user, req.sessionId = sessionId
    API->>Svc: logout(sessionId)
    Svc->>DB: Session.updateOne({ _id: sessionId }, { revokedAt: now })
    Svc->>Reg: revoke(sessionId, 15m)
    Svc-->>API: Success
    API->>API: clearCookie('refreshToken', Path=/api/v1/auth)
    API-->>Client: 200 OK { success: true, message: "Logged out successfully" }
```

---

## 3. Session Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Active: Login (Session Created)
    Active --> Active: Token Refresh (Atomic Rotation)
    Active --> Revoked: Explicit Logout (POST /logout)
    Active --> Revoked: Logout All Devices (POST /logout-all)
    Active --> Revoked: Password Changed (POST /users/change-password)
    Active --> Compromised_Revoked: Token Reuse Detected
    Active --> Compromised_Revoked: Concurrent Replay Collision
    Active --> Expired: TTL Elapsed (7 Days)
    Revoked --> Expired: TTL Index Eviction
    Compromised_Revoked --> Expired: TTL Index Eviction
    Expired --> [*]
```

---

## 4. Security & Implementation Decisions

### 4.1 Token-Family Strategy & Reuse Detection
- Refresh tokens are signed JWTs containing a unique `tokenId` (UUID v4) and the persistent `sessionId`.
- Stored tokens are never kept in plaintext; MongoDB stores a SHA-256 digest `refreshTokenHash`.
- The `consumedTokenHashes` array maintains a rolling history of the last 20 rotated tokens.
- If an old token is intercepted and later presented by an attacker (or replayed), the server detects that the token is present in `consumedTokenHashes`, immediately revokes the session in MongoDB, logs a security alert, and rejects the request.

### 4.2 Concurrency Strategy Without Assuming MongoDB Transactions
- MongoDB multi-document transactions require replica set or sharded deployments. To guarantee universal support across standalone test instances, local development, and MongoDB Atlas clusters:
- The refresh rotation uses an atomic single-document `findOneAndUpdate` operation with an exact filter condition:
  `{ _id: sessionId, refreshTokenHash: incomingTokenHash, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }`
- Because MongoDB applies document-level write locks atomically to single-document updates, if two concurrent requests present the identical token simultaneously, **exactly one** operation succeeds. The second operation receives `null`, detects the race condition, and revokes the session to safeguard account integrity.

### 4.3 Revocation Without Unnecessary MongoDB Queries on Every Request
- Checking the database on every microsecond HTTP request degrades latency and database connection pools.
- InsightFlow implements a **two-tier revocation strategy**:
  1. **User `tokenVersion`**: Stored on `User` and embedded in each access token. When `logout-all` or `change-password` executes, `tokenVersion` increments atomically. Any outstanding access tokens bearing an older `tokenVersion` fail immediately upon user lookup.
  2. **In-Memory `RevokedSessionRegistry`**: When an individual session logs out, its `sessionId` is logged in an in-memory TTL map that persists for 15 minutes (the maximum lifetime of an access token). Subsequent requests presenting that session ID are rejected immediately without database traversal. Once 15 minutes elapse, the access token naturally expires by cryptographic signature.

### 4.4 Email Verification Policy
- In Milestone 2, email delivery services (SMTP/SendGrid) and email verification link flows are intentionally not yet implemented.
- **Login Policy:** Users with `isEmailVerified: false` **are permitted to log in and use platform features**, with their verification status accurately reflected in `User` documents and `/api/v1/users/me` responses.
- The platform does not claim email verification exists until the dedicated transactional email infrastructure is deployed in a future milestone.

### 4.5 Cookie & CSRF Defense Topology
- **Cookie Attributes:**
  - `HttpOnly: true` (prevents XSS token exfiltration via JavaScript `document.cookie`).
  - `Path: /api/v1/auth` (limits cookie transmission strictly to auth routes).
  - `SameSite: "lax"` (compatible with cross-port development on localhost:5173 to localhost:5000 and same-site production topologies).
  - `Secure: true` in production (enforced via `COOKIE_SECURE`).
- **CSRF Protection:**
  - Origin/Referer matching against `FRONTEND_URL` on all state-changing cookie-authenticated endpoints.
  - Requirement of non-simple request headers (`X-Requested-With` or `Content-Type: application/json`) which browsers refuse to dispatch across origins without explicit CORS preflight authorization.
