# Changelog

All notable changes to the InsightFlow backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-11-06

### Added - Milestone 3: Document Upload & Cloudinary Storage
- **Cloudinary Authenticated Storage**: Integrated official Cloudinary SDK v2 with authenticated raw delivery (`resource_type: raw`, `type: authenticated`).
- **Multipart Document Upload**: `POST /api/v1/documents/upload` supporting PDF and DOCX files up to 20 MB with rate limiting.
- **Deep File Content Validation**: Byte-level validation for PDF (`%PDF-` header and `%%EOF` trailer) and DOCX (OPC ZIP packaging, `[Content_Types].xml`, and WordprocessingML schemas).
- **Zip-Bomb Decompression Protection**: Enforced 2 MB ceiling (`MAX_DECOMPRESSED_ENTRY_BYTES`) on XML decompression during DOCX validation.
- **Server-Controlled Public IDs**: Cryptographically random UUID identifiers preserving file extensions.
- **Cryptographic Integrity**: SHA-256 checksums calculated and persisted for uploaded documents.
- **Compensating Rollback**: Automatic Cloudinary asset destruction if MongoDB metadata persistence fails.
- **Multi-Tenant Document Management**:
  - `GET /api/v1/documents`: User-isolated listing with pagination, sorting, and processing status filtering.
  - `GET /api/v1/documents/:id`: Document details retrieval scoped to authenticated user and active state.
  - `GET /api/v1/documents/:id/download`: Authorized signed download URLs with 5-minute expiry and smart extension resolution.
  - `DELETE /api/v1/documents/:id`: Cloudinary asset destruction and MongoDB soft deletion (`isDeleted: true`).
- **Processing Job Scheduling**: Enqueues queued `full_processing` jobs in `processing_jobs` collection upon document creation.
- **Automated Test Suite**: 34 automated tests (63 total across backend) covering uploads, validation, download signing, soft deletion, and error recovery.

## [1.1.0] - 2026-11-06

### Added - Milestone 2: Authentication & Authorization System
- **User Registration**: `POST /api/v1/auth/register` with Zod validation, email normalization, bcrypt (12 rounds) hashing, and default role assignment.
- **User Login**: `POST /api/v1/auth/login` with timing attack protection (dummy bcrypt compare), rate limiting, and HttpOnly cookie generation.
- **Dual JWT Token Architecture**:
  - Short-lived Access Token (15m, signed with `JWT_ACCESS_SECRET`).
  - Long-lived Refresh Token (7d, signed with `JWT_REFRESH_SECRET`).
- **Atomic Refresh Token Rotation & Token-Family Strategy**: `POST /api/v1/auth/refresh` rotating tokens atomically using MongoDB single-document write locks without distributed transactions.
- **Token Reuse Detection**: Immediate session revocation upon presenting previously consumed refresh tokens.
- **Session Revocation**:
  - `POST /api/v1/auth/logout` revokes current session and clears refresh cookie.
  - `POST /api/v1/auth/logout-all` revokes all active sessions and increments user `tokenVersion`.
  - In-memory TTL `RevokedSessionRegistry` prevents unnecessary database lookups.
- **User Profile Management**:
  - `GET /api/v1/users/me` returns sanitized user profile.
  - `PATCH /api/v1/users/me` allows updating full name, profile picture, and preferences while strictly rejecting unauthorized field changes.
- **Password Change**: `POST /api/v1/users/change-password` with current password verification, duplicate prevention, and automatic multi-device session revocation.
- **Role-Based Access Control**: `requireRole(...roles)` middleware protecting administrative endpoints.
- **CSRF & Cookie Protection**: HttpOnly, SameSite, path-restricted cookies with Origin/Referer matching.
- **Automated Test Suite**: 29 automated tests verifying registration, login, token rotation, reuse detection, concurrent refresh, logout, profile updates, password changes, CSRF protection, and role authorization.
- **Documentation**:
  - `docs/AUTHENTICATION_ARCHITECTURE.md` with Mermaid sequence diagrams and security rationale.
  - `docs/FRONTEND_INTEGRATION.md` detailing frontend Axios configuration, interceptors, and error handling.
  - Updated `docs/API_CONTRACT.md` and `docs/IMPLEMENTATION_SUMMARY.md`.

## [1.0.0] - 2026-11-06

### Added - Milestone 1: Database Architecture and Data Models
- Initial Mongoose schemas, types, and indexes for `users`, `sessions`, `documents`, `document_chunks`, `conversations`, `messages`, and `processing_jobs`.
- Express 5 application setup with Helmet, CORS, and health check endpoint.
