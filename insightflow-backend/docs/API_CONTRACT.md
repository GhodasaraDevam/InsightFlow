# InsightFlow — API Contract

> **Version:** 1.0.0
> **Phase:** Database Architecture and Data Model Implementation
> **Last Updated:** 2026-11-06

## Overview

This document defines the planned API resource structure for InsightFlow. It serves as a forward-looking contract for frontend and backend development teams.

> [!IMPORTANT]
> **Only the health endpoint is currently implemented.** All other endpoints listed below are planned for subsequent development phases and are **not yet functional**. Do not attempt to call them.

---

## Base URL

```
http://localhost:5000/api/v1
```

## Response Format

All responses follow a consistent JSON structure:

### Success Response

```json
{
  "success": true,
  "message": "Descriptive success message",
  "data": { }
}
```

### Paginated Response

```json
{
  "success": true,
  "message": "Descriptive success message",
  "data": [ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
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
      "message": "Email is required"
    }
  ]
}
```

---

## Implemented Endpoints

### Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | None | Application health status |

**Response:**

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

## Planned Resource Structure

The following resources correspond to the database collections implemented in this phase. Endpoints will be built in subsequent milestones.

### Authentication (Phase 2 — Next)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | Register new user |
| `POST` | `/api/v1/auth/login` | None | Login and receive tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh Token | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Access Token | Revoke current session |
| `POST` | `/api/v1/auth/logout-all` | Access Token | Revoke all user sessions |

### Users (Phase 2+)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | Access Token | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Access Token | Update current user profile |
| `PATCH` | `/api/v1/users/me/password` | Access Token | Change password |
| `DELETE` | `/api/v1/users/me` | Access Token | Delete (soft) own account |

### Documents (Phase 3)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/documents` | Access Token | Upload a document |
| `GET` | `/api/v1/documents` | Access Token | List user's documents (paginated) |
| `GET` | `/api/v1/documents/:id` | Access Token | Get document details |
| `PATCH` | `/api/v1/documents/:id` | Access Token | Update document metadata |
| `DELETE` | `/api/v1/documents/:id` | Access Token | Soft-delete a document |
| `GET` | `/api/v1/documents/:id/status` | Access Token | Get processing status |

### Document Chunks (Internal / Phase 4)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/documents/:id/chunks` | Access Token | List chunks for a document |

> Chunks are primarily managed internally during document processing. Direct CRUD operations on chunks are not planned for the public API.

### Conversations (Phase 5)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/conversations` | Access Token | Create a conversation |
| `GET` | `/api/v1/conversations` | Access Token | List user's conversations (paginated) |
| `GET` | `/api/v1/conversations/:id` | Access Token | Get conversation details |
| `PATCH` | `/api/v1/conversations/:id` | Access Token | Update conversation (title, archive) |
| `DELETE` | `/api/v1/conversations/:id` | Access Token | Delete a conversation |

### Messages (Phase 5)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/conversations/:id/messages` | Access Token | Send a message (triggers AI response) |
| `GET` | `/api/v1/conversations/:id/messages` | Access Token | List messages in conversation (paginated) |

### Search (Phase 6)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/search` | Access Token | Semantic search across user's documents |

### Processing Jobs (Internal / Phase 3–4)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/processing-jobs` | Access Token | List user's processing jobs |
| `GET` | `/api/v1/processing-jobs/:id` | Access Token | Get job status and progress |

> Processing jobs are primarily managed by the backend worker system. The API provides read-only access for status monitoring.

---

## Authentication Scheme (Planned)

- **Access Tokens:** Short-lived JWTs sent in the `Authorization: Bearer <token>` header.
- **Refresh Tokens:** Long-lived tokens sent via HTTP-only secure cookies or request body.
- **Session Management:** Server-side session records in the `sessions` collection, with hashed refresh tokens and TTL auto-expiry.

---

## Common Query Parameters (Planned)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number for pagination |
| `limit` | integer | 20 | Items per page (max 100) |
| `sort` | string | varies | Sort field and direction |

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | OK — Successful request |
| `201` | Created — Resource created |
| `400` | Bad Request — Validation error |
| `401` | Unauthorized — Missing or invalid token |
| `403` | Forbidden — Insufficient permissions |
| `404` | Not Found — Resource not found |
| `409` | Conflict — Duplicate resource |
| `413` | Payload Too Large — File exceeds size limit |
| `422` | Unprocessable Entity — Semantic validation failure |
| `429` | Too Many Requests — Rate limit exceeded |
| `500` | Internal Server Error |

---

## Notes

- All endpoints that return user data will **never** include `passwordHash` or `refreshTokenHash`.
- All user-owned resources are scoped by the authenticated user's ID (injected by middleware, never from request body).
- File uploads will use `multipart/form-data`; all other requests use `application/json`.
- Phase numbers are indicative of implementation order, not release versions.

