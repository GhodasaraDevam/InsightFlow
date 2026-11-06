# InsightFlow — Cloudinary Storage Architecture

> **Document Version:** 1.0.0  
> **Milestone:** Milestone 3 — Document Upload & Cloudinary Storage  
> **Date:** 2026-11-06  

---

## 1. Executive Summary

Milestone 3 implements a secure, production-grade cloud document storage, retrieval, and management system for InsightFlow. Documents uploaded by authenticated users (PDF and DOCX) are stored in Cloudinary using authenticated raw delivery, indexed in MongoDB Atlas with cryptographic integrity checksums, and accessible strictly through time-limited authorized signed download URLs.

---

## 2. Storage Architecture

```
                    ┌─────────────────────────┐
                    │       Web Client        │
                    └───────────┬─────────────┘
                                │ Bearer Token + multipart/form-data
                                ▼
                    ┌─────────────────────────┐
                    │    InsightFlow API      │
                    │   (Express Backend)     │
                    └─────┬─────────────┬─────┘
                          │             │
        1. Upload Stream  │             │ 2. Save Metadata
       (Raw Authenticated)│             │ (with SHA-256 Checksum)
                          ▼             ▼
       ┌────────────────────────┐  ┌────────────────────────┐
       │   Cloudinary Storage   │  │     MongoDB Atlas      │
       │ (insightflow/documents)│  │      (documents &      │
       │  [Private / Encrypted] │  │    processing_jobs)    │
       └────────────────────────┘  └────────────────────────┘
```

### Key Principles:
1. **Zero Public Access:** All documents are stored under `type: "authenticated"` and `resource_type: "raw"`. No public, guessable, or unrestricted CDN URLs exist.
2. **Server-Controlled Identifiers:** Cloudinary public IDs are generated exclusively on the server using cryptographically secure UUIDs (`crypto.randomUUID()`) preserving file extensions. Original client filenames are never used as public IDs.
3. **Multi-Tenant Isolation:** Database queries enforce user ownership (`userId: req.user.id`) and soft-delete filtering (`isDeleted: false`). Users can never list, retrieve, download, or delete documents belonging to others.
4. **Data Integrity:** Uploaded files are fingerprinted via SHA-256 cryptographic hashes and stored in MongoDB `checksum`.

---

## 3. Cloudinary Configuration

Centralized in `src/config/cloudinary.ts`:

- **Folder:** `insightflow/documents`
- **Resource Type:** `raw`
  - Required for both PDF and DOCX to preserve pristine binary representations without rasterization or visual transformations.
- **Delivery Type:** `authenticated`
  - Restricts access so assets can only be accessed with signed API download tokens.
- **Public ID Strategy:** `${UUID}.${extension}`
  - Example: `insightflow/documents/3d8b5a82-f54e-4f11-9a74-4b5333e69123.pdf`
- **HTTPS Enforcement:** `secure: true` for all communications.

---

## 4. Document Lifecycles

### A. Upload Lifecycle
1. **Authentication:** Bearer token verified; active user identity established.
2. **Rate Limiting:** `uploadRateLimiter` restricts users to 20 uploads per 15 minutes.
3. **Multipart Parsing:** Multer buffers the single file in memory with a strict 20 MB size limit (`MAX_UPLOAD_SIZE_BYTES`).
4. **Validation & Magic Signature Inspection:**
   - Empty file check (`buffer.length > 0`).
   - Extension verification (`.pdf` or `.docx`).
   - Content verification:
     - **PDF:** Checked for `%PDF-` magic header within the initial 1024 bytes and `%%EOF` in the file tail.
     - **DOCX:** ZIP structure parsed from buffer. Verified presence of `[Content_Types].xml` and `word/document.xml`, with standard WordprocessingML content types verified. Arbitrary ZIP files are rejected.
5. **Streaming Upload to Cloudinary:**
   - Uploaded via `cloudinary.uploader.upload_stream` using authenticated delivery.
6. **Persistence in MongoDB:**
   - Saved in `documents` collection with `storageProvider: "cloudinary"`, `storageKey`, `storagePath`, `fileSize`, `checksum`, and safe Cloudinary metadata.
7. **Processing Job Scheduling:**
   - Automatically enqueues a `full_processing` job in `processing_jobs` with status `queued`.
8. **Safe Response:** Returns sanitized document metadata excluding credentials and raw paths.

### B. Download Lifecycle
1. **Authorization:** Authenticated user requests `GET /api/v1/documents/:id/download`.
2. **Ownership Check:** MongoDB query verifies `_id: documentId`, `userId: user.id`, and `isDeleted: false`.
3. **URL Generation:** Cloudinary SDK's `cloudinary.utils.private_download_url` generates an authorized temporary URL containing `signature`, `api_key`, `timestamp`, and `expires_at`.
4. **Short Expiration:** The signed URL expires after **300 seconds (5 minutes)**.
5. **Bearer Capability Notice:** The signed URL is a temporary bearer capability; it is never logged and never stored in the database.

### C. Deletion Lifecycle
1. **Ownership & Status Verification:** Confirms document exists, belongs to user, and is not already soft-deleted.
2. **Cloudinary Asset Destruction:** Calls `cloudinary.uploader.destroy` with `invalidate: true`.
3. **Soft Deletion in MongoDB:** Sets `isDeleted: true` and `deletedAt: new Date()` in MongoDB. (Note: This distributed two-phase operation is non-atomic across systems).
4. **Idempotent / Consistent Repeated Requests:** Repeated deletion requests return `404 Not Found`.

---

## 5. Failure Handling & Reconciliation Strategy

### 1. MongoDB Persistence Failure After Cloudinary Upload
- **Failure:** Cloudinary upload succeeds, but MongoDB insertion fails (e.g., database timeout or validation issue).
- **Remediation:** The service catches the error and immediately triggers compensation: calling `cloudinaryService.deleteAsset(uploadResult.publicId)`.
- **Alerting & Limitation:** If compensation fails, a structured log entry marked `[CRITICAL RECONCILIATION ERROR]` records the orphaned `publicId` and `assetId` without secrets. Currently, there is no persistent reconciliation queue table; an automated sweeper queue is planned for a future release.

### 2. Cloudinary Deletion Failure During Document Deletion
- **Failure:** Cloudinary API returns an error or times out during `DELETE /api/v1/documents/:id`.
- **Policy:** The backend **aborts** the operation and does **not** mark the MongoDB document as deleted. It returns `502 Bad Gateway` to the client. This guarantees documents are never marked deleted while active files remain un-deleted in storage.
- **Secondary Failure State (Cloudinary succeeds, MongoDB fails):** If Cloudinary asset destruction succeeds but the subsequent MongoDB `document.save()` fails, the document temporarily remains active in MongoDB pointing to a deleted Cloudinary asset. If the user repeats the deletion, Cloudinary returns `{ result: "not found" }`, which `cloudinaryService.deleteAsset` explicitly treats as success, allowing MongoDB soft-deletion to complete.

### 3. Processing Job Scheduling Warning
- **Policy:** If MongoDB document persistence succeeds but the initial `processing_jobs` creation encounters an issue, the document remains safely stored in MongoDB with status `uploaded`, logging a structured warning for background worker pickup in Milestone 4. Full background workers belong to Milestone 4.

---

## 6. Security Controls Summary

| Threat | Mitigation |
|---|---|
| Unauthorized download | Authenticated Cloudinary delivery; signed download URLs expiring in 5 minutes |
| Cross-tenant data leakage | MongoDB queries strictly scoped to authenticated user ID |
| Disguised malicious files | Deep byte inspection: PDF header/trailer and DOCX WordprocessingML package validation |
| Zip bomb / Arbitrary Zip upload | Strict size limits (20MB) and Office Open XML content-type verification |
| Path traversal / Unsafe names | Filename sanitization stripping control characters and extracting base names |
| Secret leakage | Credentials strictly in `env.ts`; zero exposure in API responses or logs |
| Storage exhaustion | Rate limiting (20 uploads / 15 min) and bounded 20 MB file size limit |

---

## 7. Environment Variables

Add the following to `.env`:

```env
# Cloudinary Storage Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
MAX_UPLOAD_SIZE_BYTES=20971520
```

---

## 8. Local Development & Testing

- Automated tests mock `cloudinaryService` completely and do not make network calls to Cloudinary.
- In `development` mode without credentials, safe placeholder values are used to allow the server to boot.
- Live uploads require real Cloudinary account credentials placed in `.env`.

