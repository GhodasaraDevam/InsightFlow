# InsightFlow — API Contract

> **Version:** 2.0.0
> **Phase:** Milestone 2 — Complete Authentication & Authorization System
> **Last Updated:** 2026-11-06

## Overview

This document specifies the REST API contract for InsightFlow. Milestone 2 provides full user authentication, session management, secure cookie rotation, role-based authorization, and user profile management.

---

## Base URL

```
http://localhost:5000/api/v1
```

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "message": "Descriptive success message",
  "data": { }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Descriptive error message",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}
```

---

## Implemented Endpoints (Milestone 2)

### 1. Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Application health status |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "InsightFlow backend is running",
  "data": {
    "application": "InsightFlow",
    "status": "healthy"
  }
}
```

---

### 2. User Registration

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None (Rate Limited) | Register a new user account |

**Request Body:**
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "StrongPassword123!"
}
```

**Validation Rules:**
- `fullName`: String (1-200 characters), trimmed.
- `email`: Valid email format, normalized to lowercase.
- `password`: String (8-128 characters), must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "6aedb140f89290a8872f3704",
      "fullName": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "accountStatus": "active",
      "isEmailVerified": false,
      "preferences": {
        "theme": "system",
        "language": "en",
        "notificationsEnabled": true
      },
      "createdAt": "2026-11-06T10:00:00.000Z"
    }
  }
}
```

**Common Error Codes:**
- `400 Bad Request`: Validation failure (weak password, invalid email).
- `409 Conflict`: Email is already registered.
- `429 Too Many Requests`: Rate limit exceeded.

---

### 3. User Login

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/login` | None (Rate Limited) | Authenticate user credentials and create session |

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "StrongPassword123!"
}
```

**Response (200 OK):**
- **Set-Cookie Header:** `refreshToken=<jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`
- **Body:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "6aedb140f89290a8872f3704",
      "fullName": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "accountStatus": "active",
      "isEmailVerified": false,
      "preferences": {
        "theme": "system",
        "language": "en",
        "notificationsEnabled": true
      },
      "createdAt": "2026-11-06T10:00:00.000Z",
      "lastLoginAt": "2026-11-06T10:05:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Common Error Codes:**
- `401 Unauthorized`: Generic "Invalid email or password" (protects against account enumeration).
- `403 Forbidden`: Account suspended or deleted.
- `429 Too Many Requests`: Rate limit exceeded (>10 requests in 15 minutes).

---

### 4. Refresh Access Token

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/refresh` | `refreshToken` Cookie | Atomically rotate refresh token and issue new access token |

**Headers:**
- `Origin`: Valid frontend origin (anti-CSRF).
- `X-Requested-With`: `XMLHttpRequest` (or JSON Content-Type).

**Response (200 OK):**
- **Set-Cookie Header:** Rotated `refreshToken=<new-jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`
- **Body:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Common Error Codes:**
- `401 Unauthorized`: Missing cookie, expired token, revoked session, or token reuse detected.
- `403 Forbidden`: Cross-Site Request Forgery (CSRF) origin mismatch.
- `429 Too Many Requests`: Refresh rate limit exceeded (>30 requests in 15 minutes).

---

### 5. Logout

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/logout` | Bearer Access Token | Revoke current session and clear refresh cookie |

**Headers:**
- `Authorization`: `Bearer <accessToken>`

**Response (200 OK):**
- **Set-Cookie Header:** Cleared `refreshToken=; Path=/api/v1/auth; Max-Age=0`
- **Body:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 6. Logout From All Devices

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/logout-all` | Bearer Access Token | Revoke all user sessions, increment tokenVersion, and clear cookie |

**Headers:**
- `Authorization`: `Bearer <accessToken>`

**Response (200 OK):**
- **Set-Cookie Header:** Cleared `refreshToken=; Path=/api/v1/auth; Max-Age=0`
- **Body:**
```json
{
  "success": true,
  "message": "Logged out from all devices successfully"
}
```

---

### 7. Get Current User Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/me` | Bearer Access Token | Retrieve current authenticated user profile |

**Headers:**
- `Authorization`: `Bearer <accessToken>`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "6aedb140f89290a8872f3704",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "accountStatus": "active",
    "isEmailVerified": false,
    "profilePicture": "https://example.com/avatar.jpg",
    "preferences": {
      "theme": "dark",
      "language": "en",
      "notificationsEnabled": true
    },
    "createdAt": "2026-11-06T10:00:00.000Z",
    "lastLoginAt": "2026-11-06T10:05:00.000Z"
  }
}
```

---

### 8. Update Current User Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `PATCH` | `/users/me` | Bearer Access Token | Update allowed profile fields |

**Headers:**
- `Authorization`: `Bearer <accessToken>`
- `Content-Type`: `application/json`

**Request Body (Partial):**
```json
{
  "fullName": "Johnathan Doe",
  "profilePicture": "https://example.com/avatar2.jpg",
  "preferences": {
    "theme": "light",
    "notificationsEnabled": false
  }
}
```

**Restricted Fields (Strictly Rejected with 400 Bad Request):**
`role`, `accountStatus`, `passwordHash`, `isEmailVerified`, `emailVerifiedAt`, `tokenVersion`.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "6aedb140f89290a8872f3704",
    "fullName": "Johnathan Doe",
    "email": "john@example.com",
    "role": "user",
    "accountStatus": "active",
    "isEmailVerified": false,
    "profilePicture": "https://example.com/avatar2.jpg",
    "preferences": {
      "theme": "light",
      "language": "en",
      "notificationsEnabled": false
    },
    "createdAt": "2026-11-06T10:00:00.000Z",
    "lastLoginAt": "2026-11-06T10:05:00.000Z"
  }
}
```

---

### 9. Change Password

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/users/change-password` | Bearer Access Token | Change password, revoke all existing sessions |
| `PATCH` | `/users/me/password` | Bearer Access Token | Alias to change-password |

**Headers:**
- `Authorization`: `Bearer <accessToken>`
- `Content-Type`: `application/json`

**Request Body:**
```json
{
  "currentPassword": "StrongPassword123!",
  "newPassword": "NewStrongPassword456!"
}
```

**Validation & Security Rules:**
- `newPassword` must satisfy password complexity requirements.
- `newPassword` cannot be identical to `currentPassword`.
- On success, all active sessions in MongoDB are revoked (`revokedAt = now`).
- User `tokenVersion` is incremented to instantly invalidate existing access tokens.
- Refresh cookie is cleared.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password changed successfully. All other sessions have been revoked. Please log in again."
}
```

---

## Planned Resource Structure (Subsequent Milestones)

### Documents (Phase 3)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/documents` | Access Token | Upload a document |
| `GET` | `/documents` | Access Token | List user's documents (paginated) |
| `GET` | `/documents/:id` | Access Token | Get document details |
| `PATCH` | `/documents/:id` | Access Token | Update document metadata |
| `DELETE` | `/documents/:id` | Access Token | Soft-delete a document |
| `GET` | `/documents/:id/status` | Access Token | Get processing status |

### Document Chunks (Internal / Phase 4)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/documents/:id/chunks` | Access Token | List chunks for a document |

### Conversations (Phase 5)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/conversations` | Access Token | Create a conversation |
| `GET` | `/conversations` | Access Token | List conversations |
| `GET` | `/conversations/:id` | Access Token | Get conversation thread |
| `DELETE` | `/conversations/:id` | Access Token | Delete conversation |

### Messages (Phase 5)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/conversations/:id/messages` | Access Token | Send message and receive AI response |
| `GET` | `/conversations/:id/messages` | Access Token | Retrieve message history |
