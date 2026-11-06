import { test, describe, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import request from "supertest";
import { Types } from "mongoose";
import app from "../src/app.js";
import { User } from "../src/modules/users/user.model.js";
import { Session } from "../src/modules/sessions/session.model.js";
import { DocumentModel } from "../src/modules/documents/document.model.js";
import { ProcessingJob } from "../src/modules/processing-jobs/processing-job.model.js";
import { StorageProvider, ProcessingStatus } from "../src/modules/documents/document.constants.js";
import { JobType, JobStatus } from "../src/modules/processing-jobs/processing-job.constants.js";
import { UserRole, AccountStatus } from "../src/modules/users/user.constants.js";
import { generateAccessToken } from "../src/utils/jwt.util.js";
import { hashPassword } from "../src/utils/password.util.js";
import { AppError } from "../src/utils/app-error.util.js";
import {
  cloudinaryService,
  type SafeCloudinaryUploadResult,
  type TemporaryDownloadUrlResult,
} from "../src/services/cloudinary.service.js";
import { connectTestDb, disconnectTestDb, cleanupTestData } from "./test-helper.js";

// Helper to create minimal valid DOCX buffer
function createTestDocxBuffer(hasContentTypes = true, hasWordDoc = true, isWordType = true): Buffer {
  const files: Array<{ name: string; content: string }> = [];

  if (hasContentTypes) {
    const typeStr = isWordType
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : "application/octet-stream";
    files.push({
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="${typeStr}"/></Types>`,
    });
  }

  if (hasWordDoc) {
    files.push({
      name: "word/document.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>`,
    });
  }

  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const fnBuf = Buffer.from(file.name, "utf8");
    const dataBuf = Buffer.from(file.content, "utf8");

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); // Stored
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(dataBuf.length, 18);
    lh.writeUInt32LE(dataBuf.length, 22);
    lh.writeUInt16LE(fnBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([lh, fnBuf, dataBuf]);
    localHeaders.push(localRecord);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(dataBuf.length, 20);
    cd.writeUInt32LE(dataBuf.length, 24);
    cd.writeUInt16LE(fnBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    centralDirs.push(Buffer.concat([cd, fnBuf]));
    offset += localRecord.length;
  }

  const allLocal = Buffer.concat(localHeaders);
  const allCd = Buffer.concat(centralDirs);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(allCd.length, 12);
  eocd.writeUInt32LE(allLocal.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([allLocal, allCd, eocd]);
}

function createDeflatedDocxBuffer(options?: {
  overrideXmlContent?: Buffer | string;
  corruptDeflateStream?: boolean;
}): Buffer {
  const defaultXml =
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

  const rawXml = options?.overrideXmlContent
    ? Buffer.isBuffer(options.overrideXmlContent)
      ? options.overrideXmlContent
      : Buffer.from(options.overrideXmlContent, "utf8")
    : Buffer.from(defaultXml, "utf8");

  let compData = zlib.deflateRawSync(rawXml);
  if (options?.corruptDeflateStream) {
    compData = Buffer.from("corrupted-not-a-valid-deflate-stream");
  }

  const files = [
    {
      name: "[Content_Types].xml",
      data: compData,
      uncompSize: rawXml.length,
      compMethod: 8, // Deflated
    },
    {
      name: "word/document.xml",
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
        "utf8"
      ),
      uncompSize: 135,
      compMethod: 0, // Stored
    },
  ];

  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const fnBuf = Buffer.from(file.name, "utf8");

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(file.compMethod, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(file.data.length, 18);
    lh.writeUInt32LE(file.uncompSize, 22);
    lh.writeUInt16LE(fnBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([lh, fnBuf, file.data]);
    localHeaders.push(localRecord);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(file.compMethod, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(file.data.length, 20);
    cd.writeUInt32LE(file.uncompSize, 24);
    cd.writeUInt16LE(fnBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    centralDirs.push(Buffer.concat([cd, fnBuf]));
    offset += localRecord.length;
  }

  const allLocal = Buffer.concat(localHeaders);
  const allCd = Buffer.concat(centralDirs);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(allCd.length, 12);
  eocd.writeUInt32LE(allLocal.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([allLocal, allCd, eocd]);
}

const validPdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n40\n%%EOF"
);
const validDocxBuffer = createTestDocxBuffer(true, true, true);

describe("Milestone 3: Document Upload & Cloudinary Storage Tests", () => {
  const testRunId = Date.now();
  const userOneEmail = `doc_user1_${testRunId}@example.com`;
  const userTwoEmail = `doc_user2_${testRunId}@example.com`;
  let userOneId: string;
  let userTwoId: string;
  let userOneToken: string;
  let userTwoToken: string;

  // Cloudinary service spy & mock state
  const originalUpload = cloudinaryService.uploadDocument;
  const originalDownload = cloudinaryService.generateDownloadUrl;
  const originalDelete = cloudinaryService.deleteAsset;

  let uploadedAssets: string[] = [];
  let deletedAssets: string[] = [];
  let uploadFailureRequested = false;
  let deleteFailureRequested = false;
  let downloadUrlFailureRequested = false;

  before(async () => {
    await connectTestDb();
    await cleanupTestData(/doc_user/);

    const passwordHash = await hashPassword("StrongPassword123!");

    // Create User One
    const u1 = await User.create({
      fullName: "User One",
      email: userOneEmail,
      passwordHash,
      role: UserRole.USER,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: true,
      tokenVersion: 0,
    });
    userOneId = u1._id.toString();

    const session1 = await Session.create({
      userId: u1._id,
      refreshTokenHash: "mock_hash_1",
      userAgent: "test-agent",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isRevoked: false,
    });

    userOneToken = generateAccessToken({
      sub: userOneId,
      email: u1.email,
      role: u1.role,
      sessionId: session1._id.toString(),
      tokenVersion: 0,
    });

    // Create User Two (for multi-tenant isolation tests)
    const u2 = await User.create({
      fullName: "User Two",
      email: userTwoEmail,
      passwordHash,
      role: UserRole.USER,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: true,
      tokenVersion: 0,
    });
    userTwoId = u2._id.toString();

    const session2 = await Session.create({
      userId: u2._id,
      refreshTokenHash: "mock_hash_2",
      userAgent: "test-agent",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isRevoked: false,
    });

    userTwoToken = generateAccessToken({
      sub: userTwoId,
      email: u2.email,
      role: u2.role,
      sessionId: session2._id.toString(),
      tokenVersion: 0,
    });
  });

  after(async () => {
    cloudinaryService.uploadDocument = originalUpload;
    cloudinaryService.generateDownloadUrl = originalDownload;
    cloudinaryService.deleteAsset = originalDelete;

    await cleanupTestData(/doc_user/);
    await disconnectTestDb();
  });

  beforeEach(() => {
    uploadedAssets = [];
    deletedAssets = [];
    uploadFailureRequested = false;
    deleteFailureRequested = false;
    downloadUrlFailureRequested = false;

    // Default mock implementations
    cloudinaryService.uploadDocument = async (
      buffer: Buffer,
      options: { publicId: string; filename?: string }
    ): Promise<SafeCloudinaryUploadResult> => {
      if (uploadFailureRequested) {
        throw new AppError("Failed to upload document to storage provider", 502);
      }
      const fullPublicId = `insightflow/documents/${options.publicId}`;
      uploadedAssets.push(fullPublicId);
      return {
        assetId: `asset_${Date.now()}`,
        publicId: fullPublicId,
        resourceType: "raw",
        deliveryType: "authenticated",
        format: options.publicId.endsWith(".pdf") ? "pdf" : "docx",
        bytes: buffer.length,
        version: 1,
        secureUrl: `https://res.cloudinary.com/test-cloud/raw/authenticated/v1/${fullPublicId}`,
      };
    };

    cloudinaryService.generateDownloadUrl = (
      publicId: string,
      format?: string,
      expiresInSeconds = 300
    ): TemporaryDownloadUrlResult => {
      if (downloadUrlFailureRequested) {
        throw new AppError("Failed to generate secure document download URL", 500);
      }
      return originalDownload.call(cloudinaryService, publicId, format, expiresInSeconds);
    };

    cloudinaryService.deleteAsset = async (
      publicId: string
    ): Promise<{ success: boolean; result: string }> => {
      deletedAssets.push(publicId);
      if (deleteFailureRequested) {
        throw new AppError("Failed to remove document from storage provider", 502);
      }
      return { success: true, result: "ok" };
    };
  });

  afterEach(() => {
    // Keep mock active throughout suite; restored in after()
  });

  /* ==========================================
   * 1. UPLOAD TESTS
   * ========================================== */
  describe("Upload Endpoint (POST /api/v1/documents/upload)", () => {
    test("1. Successfully upload a valid PDF", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", validPdfBuffer, "annual-report.pdf");

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.document.originalName, "annual-report.pdf");
      assert.equal(res.body.data.document.mimeType, "application/pdf");
      assert.equal(res.body.data.document.extension, ".pdf");
      assert.equal(res.body.data.document.storageProvider, StorageProvider.CLOUDINARY);
      assert.equal(res.body.data.document.processingStatus, ProcessingStatus.QUEUED);
      assert.ok(res.body.data.document.id);
      assert.ok(res.body.data.document.checksum);

      // Verify ProcessingJob was scheduled
      const job = await ProcessingJob.findOne({
        documentId: new Types.ObjectId(res.body.data.document.id),
      });
      assert.ok(job);
      assert.equal(job.jobType, JobType.FULL_PROCESSING);
      assert.equal(job.status, JobStatus.QUEUED);
      assert.equal(job.userId.toString(), userOneId);
    });

    test("2. Successfully upload a valid DOCX", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", validDocxBuffer, "contract.docx");

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.document.originalName, "contract.docx");
      assert.equal(
        res.body.data.document.mimeType,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.equal(res.body.data.document.extension, ".docx");
      assert.equal(res.body.data.document.storageProvider, StorageProvider.CLOUDINARY);
      assert.equal(res.body.data.document.processingStatus, ProcessingStatus.QUEUED);
    });

    test("3. Reject missing file", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /No file provided/i);
    });

    test("4. Reject unsupported file type", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", Buffer.from("console.log('malicious');"), "script.exe");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Unsupported file type/i);
    });

    test("5. Reject invalid PDF content", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", Buffer.from("Corrupted non-pdf header content"), "fake.pdf");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /does not match valid PDF specifications/i);
    });

    test("6. Reject invalid DOCX archive", async () => {
      // Arbitrary ZIP archive without WordprocessingML structure
      const nonDocxZip = createTestDocxBuffer(false, false, false);

      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", nonDocxZip, "fake.docx");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /not a valid Office Open XML Word document/i);
    });

    test("7. Reject oversized file", async () => {
      // Generate a buffer exceeding 20 MB limit
      const oversizedBuffer = Buffer.alloc(21 * 1024 * 1024);
      oversizedBuffer.write("%PDF-1.4\n%%EOF");

      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", oversizedBuffer, "large.pdf");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /exceeds maximum permitted size/i);
    });

    test("8. Reject empty file", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", Buffer.alloc(0), "empty.pdf");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Uploaded file is empty/i);
    });

    test("9. Reject unauthenticated upload", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .attach("file", validPdfBuffer, "unauthenticated.pdf");

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test("10. Handle Cloudinary upload failure", async () => {
      uploadFailureRequested = true;

      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", validPdfBuffer, "fail-cloud.pdf");

      assert.equal(res.status, 502);
      assert.equal(res.body.success, false);
    });

    test("11. Handle MongoDB persistence failure after Cloudinary upload", async () => {
      // Simulate MongoDB failure by stubbing DocumentModel.create to throw
      const origCreate = DocumentModel.create;
      // @ts-expect-error Mocking for test
      DocumentModel.create = async () => {
        throw new Error("Simulated MongoDB connection drop during document save");
      };

      try {
        const res = await request(app)
          .post("/api/v1/documents/upload")
          .set("Authorization", `Bearer ${userOneToken}`)
          .attach("file", validPdfBuffer, "db-fail.pdf");

        assert.equal(res.status, 500);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /Failed to persist document metadata/i);
      } finally {
        DocumentModel.create = origCreate;
      }
    });

    test("12. Attempt cleanup of uploaded asset when persistence fails", async () => {
      const origCreate = DocumentModel.create;
      // @ts-expect-error Mocking for test
      DocumentModel.create = async () => {
        throw new Error("Simulated database failure");
      };

      try {
        await request(app)
          .post("/api/v1/documents/upload")
          .set("Authorization", `Bearer ${userOneToken}`)
          .attach("file", validPdfBuffer, "cleanup-test.pdf");

        // Verify that deleteAsset was called for the uploaded publicId
        assert.equal(deletedAssets.length, 1);
        assert.match(deletedAssets[0], /insightflow\/documents/);
      } finally {
        DocumentModel.create = origCreate;
      }
    });
  });

  /* ==========================================
   * 2. LISTING AND RETRIEVAL TESTS
   * ========================================== */
  describe("Document Listing & Retrieval (GET /api/v1/documents)", () => {
    let docUserOneId: string;
    let docUserTwoId: string;
    let softDeletedDocId: string;

    before(async () => {
      // Create documents for user 1
      const doc1 = await DocumentModel.create({
        userId: new Types.ObjectId(userOneId),
        originalName: "user1-doc1.pdf",
        displayName: "User 1 Doc 1",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1000,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/u1_doc1.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/u1_doc1.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      docUserOneId = doc1._id.toString();

      // Create soft-deleted document for user 1
      const softDel = await DocumentModel.create({
        userId: new Types.ObjectId(userOneId),
        originalName: "user1-deleted.pdf",
        displayName: "User 1 Deleted",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1000,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/u1_del.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/u1_del.pdf",
        processingStatus: ProcessingStatus.UPLOADED,
        isDeleted: true,
        deletedAt: new Date(),
      });
      softDeletedDocId = softDel._id.toString();

      // Create document for user 2
      const doc2 = await DocumentModel.create({
        userId: new Types.ObjectId(userTwoId),
        originalName: "user2-doc1.pdf",
        displayName: "User 2 Doc 1",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 2000,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/u2_doc1.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/u2_doc1.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      docUserTwoId = doc2._id.toString();
    });

    test("13. List only the authenticated user's documents", async () => {
      const res = await request(app)
        .get("/api/v1/documents")
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.documents));

      // Must not contain user 2's document
      const docIds = res.body.data.documents.map((d: { id: string }) => d.id);
      assert.ok(docIds.includes(docUserOneId));
      assert.ok(!docIds.includes(docUserTwoId));
    });

    test("14. Exclude soft-deleted documents", async () => {
      const res = await request(app)
        .get("/api/v1/documents")
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 200);
      const docIds = res.body.data.documents.map((d: { id: string }) => d.id);
      assert.ok(!docIds.includes(softDeletedDocId));
    });

    test("15. Verify pagination", async () => {
      const res = await request(app)
        .get("/api/v1/documents?page=1&limit=1")
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.pagination.page, 1);
      assert.equal(res.body.data.pagination.limit, 1);
      assert.ok(res.body.data.pagination.totalDocuments >= 1);
      assert.equal(res.body.data.documents.length, 1);
    });

    test("16. Retrieve a document belonging to the current user", async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${docUserOneId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.document.id, docUserOneId);
      assert.equal(res.body.data.document.originalName, "user1-doc1.pdf");
      // Never expose secrets
      assert.equal(res.body.data.document.storagePath, undefined);
      assert.equal(res.body.data.document.storageKey, undefined);
    });

    test("17. Reject access to another user's document", async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${docUserTwoId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Document not found/i);
    });

    test("18. Reject malformed ObjectId", async () => {
      const res = await request(app)
        .get("/api/v1/documents/not-a-valid-object-id")
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Invalid document ID format/i);
    });
  });

  /* ==========================================
   * 3. DOWNLOAD TESTS
   * ========================================== */
  describe("Download Endpoint (GET /api/v1/documents/:id/download)", () => {
    let ownedDocId: string;
    let otherUserDocId: string;
    let softDeletedDocId: string;

    before(async () => {
      const owned = await DocumentModel.create({
        userId: new Types.ObjectId(userOneId),
        originalName: "owned-doc.pdf",
        displayName: "Owned Doc",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1500,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/owned_123.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/owned_123.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      ownedDocId = owned._id.toString();

      const other = await DocumentModel.create({
        userId: new Types.ObjectId(userTwoId),
        originalName: "other-doc.pdf",
        displayName: "Other Doc",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1500,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/other_123.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/other_123.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      otherUserDocId = other._id.toString();

      const softDel = await DocumentModel.create({
        userId: new Types.ObjectId(userOneId),
        originalName: "soft-deleted.pdf",
        displayName: "Soft Deleted",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1500,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/soft_123.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/soft_123.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: true,
        deletedAt: new Date(),
      });
      softDeletedDocId = softDel._id.toString();
    });

    test("19. Generate a temporary URL for an owned document", async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${ownedDocId}/download`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.downloadUrl);
      assert.ok(res.body.data.expiresAt);
      assert.equal(res.body.data.expiresInSeconds, 300);
      assert.match(res.body.data.downloadUrl, /signature=/);
    });

    test("20. Reject downloads for another user's document", async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${otherUserDocId}/download`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Document not found/i);
    });

    test("21. Reject download for soft-deleted document", async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${softDeletedDocId}/download`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Document not found/i);
    });

    test("22. Handle Cloudinary URL-generation failure", async () => {
      downloadUrlFailureRequested = true;

      const res = await request(app)
        .get(`/api/v1/documents/${ownedDocId}/download`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 500);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Failed to generate secure document download URL/i);
    });
  });

  /* ==========================================
   * 4. DELETION TESTS
   * ========================================== */
  describe("Deletion Endpoint (DELETE /api/v1/documents/:id)", () => {
    let docToDeleteId: string;
    let docToFailDeleteId: string;
    let otherUserDocId: string;

    beforeEach(async () => {
      const doc = await DocumentModel.create({
        userId: new Types.ObjectId(userOneId),
        originalName: "to-delete.pdf",
        displayName: "To Delete",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1000,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/to_delete_123.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/to_delete_123.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      docToDeleteId = doc._id.toString();

      const docFail = await DocumentModel.create({
        userId: new Types.ObjectId(userOneId),
        originalName: "fail-delete.pdf",
        displayName: "Fail Delete",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1000,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/fail_delete_123.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/fail_delete_123.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      docToFailDeleteId = docFail._id.toString();

      const docOther = await DocumentModel.create({
        userId: new Types.ObjectId(userTwoId),
        originalName: "other-to-delete.pdf",
        displayName: "Other To Delete",
        mimeType: "application/pdf",
        extension: ".pdf",
        fileSize: 1000,
        storageProvider: StorageProvider.CLOUDINARY,
        storageKey: "insightflow/documents/other_delete_123.pdf",
        storagePath: "https://res.cloudinary.com/test-cloud/other_delete_123.pdf",
        processingStatus: ProcessingStatus.COMPLETED,
        isDeleted: false,
      });
      otherUserDocId = docOther._id.toString();
    });

    test("23. Successfully delete an owned document", async () => {
      const res = await request(app)
        .delete(`/api/v1/documents/${docToDeleteId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, docToDeleteId);
      assert.equal(res.body.data.isDeleted, true);
    });

    test("24. Reject deletion of another user's document", async () => {
      const res = await request(app)
        .delete(`/api/v1/documents/${otherUserDocId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Document not found/i);
    });

    test("25. Verify MongoDB soft deletion", async () => {
      await request(app)
        .delete(`/api/v1/documents/${docToDeleteId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      // Inspect DB directly: document record is preserved with isDeleted=true
      const rawDoc = await DocumentModel.findOne({
        _id: new Types.ObjectId(docToDeleteId),
        isDeleted: true,
      });
      assert.ok(rawDoc);
      assert.equal(rawDoc.isDeleted, true);
      assert.ok(rawDoc.deletedAt instanceof Date);
    });

    test("26. Verify Cloudinary deletion", async () => {
      await request(app)
        .delete(`/api/v1/documents/${docToDeleteId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.ok(deletedAssets.includes("insightflow/documents/to_delete_123.pdf"));
    });

    test("27. Handle Cloudinary deletion failure", async () => {
      deleteFailureRequested = true;

      const res = await request(app)
        .delete(`/api/v1/documents/${docToFailDeleteId}`)
        .set("Authorization", `Bearer ${userOneToken}`);

      assert.equal(res.status, 502);
      assert.equal(res.body.success, false);

      // Verify MongoDB was NOT marked deleted
      const checkDoc = await DocumentModel.findById(docToFailDeleteId);
      assert.ok(checkDoc);
      assert.equal(checkDoc.isDeleted, false);
    });

    test("28. Handle repeated deletion consistently", async () => {
      // First deletion succeeds
      const firstRes = await request(app)
        .delete(`/api/v1/documents/${docToDeleteId}`)
        .set("Authorization", `Bearer ${userOneToken}`);
      assert.equal(firstRes.status, 200);

      // Second deletion returns 404
      const secondRes = await request(app)
        .delete(`/api/v1/documents/${docToDeleteId}`)
        .set("Authorization", `Bearer ${userOneToken}`);
      assert.equal(secondRes.status, 404);
      assert.equal(secondRes.body.success, false);
      assert.match(secondRes.body.message, /Document not found/i);
    });
  });

  /* ==========================================================
   * 5. POST-AUDIT SECURITY FIXES & REGRESSION TESTS
   * ========================================================== */
  describe("Security Fixes & Decompression Regression Tests", () => {
    test("29. A valid DOCX still passes validation", async () => {
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", validDocxBuffer, "valid-sample.docx");

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.document.extension, ".docx");
    });

    test("30. A malformed or truncated DOCX is rejected safely", async () => {
      const truncatedDocx = validDocxBuffer.subarray(0, 45); // truncated headers
      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", truncatedDocx, "truncated.docx");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /not a valid Office Open XML Word document/i);
    });

    test("31. A DOCX whose decompressed XML exceeds configured limit (2MB) is rejected", async () => {
      // Create a deflated DOCX where [Content_Types].xml expands to 3 MB (exceeding 2 MB limit)
      const bigXml = Buffer.concat([
        Buffer.from(
          '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        ),
        Buffer.alloc(3 * 1024 * 1024, " "), // 3MB filler
        Buffer.from("</Types>"),
      ]);

      const bombDocx = createDeflatedDocxBuffer({ overrideXmlContent: bigXml });

      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", bombDocx, "zip-bomb.docx");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /not a valid Office Open XML Word document/i);
    });

    test("32. Decompression errors return controlled validation responses", async () => {
      // Corrupt deflate stream so zlib throws an error
      const corruptedDocx = createDeflatedDocxBuffer({ corruptDeflateStream: true });

      const res = await request(app)
        .post("/api/v1/documents/upload")
        .set("Authorization", `Bearer ${userOneToken}`)
        .attach("file", corruptedDocx, "corrupted-deflate.docx");

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /not a valid Office Open XML Word document/i);
      // Ensure no stack traces or raw errors are returned
      assert.deepEqual(res.body.errors, []);
    });

    test("33. Download URL generation preserves the correct PDF extension without duplicate", async () => {
      const publicIdWithPdf = "insightflow/documents/report-2026.pdf";
      const downloadResult = cloudinaryService.generateDownloadUrl(publicIdWithPdf, "pdf");

      assert.ok(downloadResult.downloadUrl);
      assert.match(downloadResult.downloadUrl, /report-2026\.pdf/);
      assert.ok(!downloadResult.downloadUrl.includes(".pdf.pdf"));
      assert.ok(!downloadResult.downloadUrl.includes("&format="));
    });

    test("34. Download URL generation preserves the correct DOCX extension without duplicate", async () => {
      const publicIdWithDocx = "insightflow/documents/contract-2026.docx";
      const downloadResult = cloudinaryService.generateDownloadUrl(publicIdWithDocx, "docx");

      assert.ok(downloadResult.downloadUrl);
      assert.match(downloadResult.downloadUrl, /contract-2026\.docx/);
      assert.ok(!downloadResult.downloadUrl.includes(".docx.docx"));
      assert.ok(!downloadResult.downloadUrl.includes("&format="));
    });
  });
});
