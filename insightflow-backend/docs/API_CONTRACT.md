# InsightFlow — API Contract

> **Version:** 1.2.0
> **Phase:** Milestone 3 — Document Upload & Cloudinary Storage
> **Last Updated:** 2026-11-06

## Overview

This document specifies the REST API contract for InsightFlow. Milestone 2 provides full user authentication, session management, secure cookie rotation, role-based authorization, and user profile management. Milestone 3 adds secure multi-tenant document upload, signature validation, Cloudinary authenticated storage, metadata retrieval, temporary signed downloads, and soft deletion.

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

## Implemented Endpoints (Milestones 2 & 3)

### Milestone 3: Documents API

#### 1. Upload Document

| Method | Path | Auth | Rate Limit | Content-Type |
|---|---|---|---|---|
| `POST` | `/documents/upload` | Bearer Access Token | 20 req / 15 min | `multipart/form-data` |

**Form-Data Fields:**
- `file`: Single binary file (`.pdf` or `.docx`). Maximum size: 20 MB (configurable via `MAX_UPLOAD_SIZE_BYTES`).

**Validation Rules:**
- Accept one document per request.
- Supported file extensions: `.pdf`, `.docx`.
- File content signature verified:
  - PDF: Verified magic header `%PDF-` and trailer marker `%%EOF`.
  - DOCX: Verified ZIP structure containing `[Content_Types].xml` and `word/document.xml` with standard WordprocessingML schemas. Arbitrary or renamed ZIP archives are rejected.
- Uploads directly to Cloudinary authenticated raw storage under `insightflow/documents/`.
- Automatically schedules a `full_processing` job in MongoDB `processing_jobs` collection.
- Rollback: If MongoDB document metadata persistence fails, the Cloudinary asset is automatically destroyed to prevent storage leaks.

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "document": {
      "id": "672ce3467c9c0b1e428df101",
      "originalName": "quarterly-report.pdf",
      "displayName": "quarterly-report.pdf",
      "mimeType": "application/pdf",
      "extension": ".pdf",
      "fileSize": 1048576,
      "storageProvider": "cloudinary",
      "checksum": "<sample_sha256_checksum_64_hex_characters_placeholder>",
      "processingStatus": "queued",
      "createdAt": "2026-11-06T16:30:00.000Z",
      "updatedAt": "2026-11-06T16:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing file, empty file, unsupported extension, invalid file signature / non-Office Open XML archive, or file exceeding maximum allowed limit.
- `401 Unauthorized`: Missing, expired, or invalid Bearer token.
- `502 Bad Gateway`: Cloudinary storage provider upload failure.

---

#### 2. List Documents

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/documents` | Bearer Access Token | List user's documents with pagination and filtering |

**Query Parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | Integer | `1` | Page number (min 1) |
| `limit` | Integer | `10` | Items per page (min 1, max 100) |
| `status` | String | `undefined` | Filter by `processingStatus` (`uploaded`, `queued`, `processing`, `completed`, `failed`) |
| `sortBy` | String | `createdAt` | Sort field (`createdAt`, `updatedAt`, `originalName`, `fileSize`) |
| `sortOrder` | String | `desc` | Sort direction (`asc`, `desc`) |

**Security & Multi-Tenancy:**
- Automatically filters by `userId: req.user.id`.
- Automatically excludes soft-deleted documents (`isDeleted: false`).

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Documents retrieved successfully",
  "data": {
    "documents": [
      {
        "id": "672ce3467c9c0b1e428df101",
        "originalName": "quarterly-report.pdf",
        "displayName": "quarterly-report.pdf",
        "mimeType": "application/pdf",
        "extension": ".pdf",
        "fileSize": 1048576,
        "storageProvider": "cloudinary",
        "checksum": "<sample_sha256_checksum_64_hex_characters_placeholder>",
        "processingStatus": "queued",
        "createdAt": "2026-11-06T16:30:00.000Z",
        "updatedAt": "2026-11-06T16:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalDocuments": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

#### 3. Get Document Details

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/documents/:id` | Bearer Access Token | Get safe document details by MongoDB ObjectId |

**Security & Multi-Tenancy:**
- Scoped to authenticated user ID and `isDeleted: false`.
- Never exposes Cloudinary API secrets, raw storage paths, or internal URLs.
- Returns `404 Not Found` if the document does not exist, is soft-deleted, or belongs to another user.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Document retrieved successfully",
  "data": {
    "document": {
      "id": "672ce3467c9c0b1e428df101",
      "originalName": "quarterly-report.pdf",
      "displayName": "quarterly-report.pdf",
      "mimeType": "application/pdf",
      "extension": ".pdf",
      "fileSize": 1048576,
      "storageProvider": "cloudinary",
      "checksum": "<sample_sha256_checksum_64_hex_characters_placeholder>",
      "processingStatus": "queued",
      "createdAt": "2026-11-06T16:30:00.000Z",
      "updatedAt": "2026-11-06T16:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Malformed or invalid MongoDB ObjectId format.
- `404 Not Found`: Document not found or not owned by user.

---

#### 4. Download Document (Temporary Signed URL)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/documents/:id/download` | Bearer Access Token | Generate temporary signed Cloudinary download URL |

**Security & Lifetime:**
- Generates a short-lived bearer URL using Cloudinary SDK's official `private_download_url`.
- Valid for **300 seconds (5 minutes)**.
- Backend authorizes every download request; no public links exist.
- Signed URLs are never logged or persisted in the database.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Temporary download URL generated successfully",
  "data": {
    "downloadUrl": "https://api.cloudinary.com/v1_1/<cloud_name>/raw/download?timestamp=1730910600&public_id=insightflow%2Fdocuments%2F<public_id>&type=authenticated&expires_at=1730910900&signature=<signature>&api_key=<api_key>",
    "expiresAt": "2026-11-06T16:35:00.000Z",
    "expiresInSeconds": 300
  }
}
```

**Error Responses:**
- `400 Bad Request`: Malformed MongoDB ObjectId.
- `404 Not Found`: Document not found, soft-deleted, or owned by another user.
- `500 Internal Server Error`: Cloudinary SDK signature generation error.

---

#### 5. Delete Document (Soft Delete & Storage Cleanup)

| Method | Path | Auth | Description |
|---|---|---|---|
| `DELETE` | `/documents/:id` | Bearer Access Token | Destroys Cloudinary asset and soft-deletes MongoDB document |

**Workflow & Idempotency:**
1. Validates ownership and confirms document is not already soft-deleted.
2. Calls Cloudinary SDK `uploader.destroy` to permanently purge the asset from cloud storage.
3. If Cloudinary deletion succeeds, updates MongoDB document: sets `isDeleted: true` and `deletedAt: new Date()`.
4. If Cloudinary deletion fails, the document is NOT marked as deleted, and a `502 Bad Gateway` error is returned.
5. Repeated deletion requests return `404 Not Found` consistently.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "data": {
    "id": "672ce3467c9c0b1e428df101",
    "isDeleted": true
  }
}
```

---

### Milestone 2: Authentication & User Endpoints

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

### Document Chunks (Internal / Milestone 4)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/documents/:id/chunks` | Access Token | List chunks for a document |

### Conversations (Milestone 5)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/conversations` | Access Token | Create a conversation |
| `GET` | `/conversations` | Access Token | List conversations |
| `GET` | `/conversations/:id` | Access Token | Get conversation thread |
| `DELETE` | `/conversations/:id` | Access Token | Delete conversation |

### Messages (Milestone 5)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/conversations/:id/messages` | Access Token | Send message and receive AI response |
| `GET` | `/conversations/:id/messages` | Access Token | Retrieve message history |
