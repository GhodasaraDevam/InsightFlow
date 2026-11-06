import path from "node:path";
import zlib from "node:zlib";
import { z } from "zod";
import {
  ALLOWED_EXTENSIONS,
  PROCESSING_STATUSES,
  ProcessingStatus,
  type AllowedMimeType,
} from "./document.constants.js";
import { AppError } from "../../utils/app-error.util.js";
import { isValidObjectId } from "../../utils/objectid.util.js";
import { env } from "../../config/env.js";

export interface ValidatedDocumentFile {
  buffer: Buffer;
  originalName: string;
  displayName: string;
  mimeType: AllowedMimeType;
  extension: ".pdf" | ".docx";
  fileSize: number;
}

/** Maximum permitted decompressed size for XML entries (2 MB) to prevent zip bomb attacks */
export const MAX_DECOMPRESSED_ENTRY_BYTES = 2 * 1024 * 1024;

/**
 * Validates a buffer for PDF signature.
 * A valid PDF must start with `%PDF-` within the first 1024 bytes and contain `%%EOF`.
 */
export const validatePdfContent = (buffer: Buffer): boolean => {
  if (buffer.length < 10) return false;

  // Search for %PDF- in the header section (up to 1024 bytes)
  const headerLimit = Math.min(buffer.length, 1024);
  const headerSlice = buffer.subarray(0, headerLimit).toString("binary");
  if (!headerSlice.includes("%PDF-")) {
    return false;
  }

  // Search for %%EOF in the trailing section (up to 2048 bytes from end)
  const trailerStart = Math.max(0, buffer.length - 2048);
  const trailerSlice = buffer.subarray(trailerStart).toString("binary");
  return trailerSlice.includes("%%EOF");
};

interface ZipEntryInfo {
  fileName: string;
  compMethod: number;
  compSize: number;
  uncompSize: number;
  dataOffset: number;
}

/**
 * Parses and extracts ZIP entries from a buffer safely.
 * Returns null if the buffer is not a valid ZIP archive.
 */
const parseZipEntries = (buffer: Buffer): ZipEntryInfo[] | null => {
  if (buffer.length < 22) return null;

  // Verify leading magic bytes: PK\x03\x04 or PK\x05\x06
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return null;
  }

  // Search for End of Central Directory (EOCD) signature: 0x06054b50
  let eocdOffset = -1;
  const maxSearch = Math.min(buffer.length, 65557);
  for (let i = buffer.length - 22; i >= buffer.length - maxSearch; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return null;
  }

  const cdTotalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset + cdSize > buffer.length) {
    return null;
  }

  const entries: ZipEntryInfo[] = [];
  let curr = cdOffset;

  for (let i = 0; i < cdTotalEntries && curr + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(curr) !== 0x02014b50) {
      return null;
    }

    const compMethod = buffer.readUInt16LE(curr + 10);
    const compSize = buffer.readUInt32LE(curr + 20);
    const uncompSize = buffer.readUInt32LE(curr + 24);
    const fnLen = buffer.readUInt16LE(curr + 28);
    const extraLen = buffer.readUInt16LE(curr + 30);
    const commentLen = buffer.readUInt16LE(curr + 32);
    const localHeaderOffset = buffer.readUInt32LE(curr + 42);

    if (curr + 46 + fnLen > buffer.length) {
      return null;
    }

    const fileName = buffer.toString("utf8", curr + 46, curr + 46 + fnLen);

    // Compute data offset from local file header
    if (localHeaderOffset + 30 <= buffer.length && buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localFnLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFnLen + localExtraLen;
      entries.push({
        fileName,
        compMethod,
        compSize,
        uncompSize,
        dataOffset,
      });
    } else {
      entries.push({
        fileName,
        compMethod,
        compSize,
        uncompSize,
        dataOffset: -1,
      });
    }

    curr += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
};

/**
 * Validates whether a buffer is a genuine Office Open XML Word document (DOCX),
 * and not merely an arbitrary ZIP archive.
 */
export const validateDocxContent = (buffer: Buffer): boolean => {
  const entries = parseZipEntries(buffer);
  if (!entries || entries.length === 0) {
    return false;
  }

  const fileNames = entries.map((e) => e.fileName.replace(/\\/g, "/"));

  // 1. Mandatory OPC file
  const hasContentTypes = fileNames.includes("[Content_Types].xml");
  if (!hasContentTypes) {
    return false;
  }

  // 2. WordprocessingML main document structure
  const hasWordDocument = fileNames.some(
    (fn) => fn === "word/document.xml" || fn.startsWith("word/")
  );
  if (!hasWordDocument) {
    return false;
  }

  // 3. Inspect [Content_Types].xml content to confirm wordprocessingml type
  const contentTypesEntry = entries.find(
    (e) => e.fileName.replace(/\\/g, "/") === "[Content_Types].xml"
  );

  if (contentTypesEntry && contentTypesEntry.dataOffset > 0) {
    try {
      // Reject if declared uncompressed size exceeds safe limit
      if (contentTypesEntry.uncompSize > MAX_DECOMPRESSED_ENTRY_BYTES) {
        return false;
      }

      const { dataOffset, compSize, compMethod } = contentTypesEntry;
      if (dataOffset + compSize <= buffer.length) {
        const compressedData = buffer.subarray(dataOffset, dataOffset + compSize);
        let xmlContent = "";

        if (compMethod === 0) {
          // Stored (no compression)
          if (compSize > MAX_DECOMPRESSED_ENTRY_BYTES) {
            return false;
          }
          xmlContent = compressedData.toString("utf8");
        } else if (compMethod === 8) {
          // Deflated with strict output size limit (prevents zip bomb memory exhaustion)
          const decompressed = zlib.inflateRawSync(compressedData, {
            maxOutputLength: MAX_DECOMPRESSED_ENTRY_BYTES,
          });
          xmlContent = decompressed.toString("utf8");
        } else {
          // Unsupported or corrupted compression method
          return false;
        }

        if (!xmlContent) {
          return false;
        }

        const hasWordprocessingMlType =
          xmlContent.includes("wordprocessingml") ||
          xmlContent.includes("application/vnd.openxmlformats-officedocument.wordprocessingml");
        if (!hasWordprocessingMlType) {
          return false;
        }
      }
    } catch {
      // If decompression fails, is truncated, or exceeds size limits, reject safely
      return false;
    }
  }

  return true;
};

/**
 * Sanitizes a filename, preventing directory traversal and removing control chars.
 */
export const sanitizeFilename = (filename: string): string => {
  // Strip null bytes and control chars
  const sanitized = filename.replace(/[\x00-\x1f\x80-\x9f]/g, "").trim();
  // Extract basename to prevent path traversal
  const base = path.basename(sanitized);
  return base || "document";
};

/**
 * Comprehensive validator for uploaded files.
 */
export const validateDocumentFile = (file?: Express.Multer.File): ValidatedDocumentFile => {
  if (!file || !file.buffer) {
    throw new AppError("No file provided. Please upload a file.", 400);
  }

  if (file.size === 0 || file.buffer.length === 0) {
    throw new AppError("Uploaded file is empty.", 400);
  }

  if (file.size > env.MAX_UPLOAD_SIZE_BYTES) {
    const maxMb = Math.round(env.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024));
    throw new AppError(`File exceeds maximum permitted size of ${maxMb}MB.`, 400);
  }

  const rawFilename = file.originalname || "document";
  const sanitizedName = sanitizeFilename(rawFilename);
  const ext = path.extname(sanitizedName).toLowerCase();

  if (ext !== ".pdf" && ext !== ".docx") {
    throw new AppError(
      `Unsupported file type '${ext}'. Allowed types are: .pdf, .docx`,
      400
    );
  }

  let validatedMimeType: AllowedMimeType;

  if (ext === ".pdf") {
    const isValidPdf = validatePdfContent(file.buffer);
    if (!isValidPdf) {
      throw new AppError(
        "Invalid file content: file does not match valid PDF specifications.",
        400
      );
    }
    validatedMimeType = "application/pdf";
  } else {
    const isValidDocx = validateDocxContent(file.buffer);
    if (!isValidDocx) {
      throw new AppError(
        "Invalid file content: file is not a valid Office Open XML Word document (DOCX).",
        400
      );
    }
    validatedMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return {
    buffer: file.buffer,
    originalName: sanitizedName,
    displayName: sanitizedName,
    mimeType: validatedMimeType,
    extension: ext,
    fileSize: file.size,
  };
};

export const documentIdParamSchema = z.object({
  id: z
    .string()
    .refine((val) => isValidObjectId(val), {
      message: "Invalid document ID format",
    }),
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum(PROCESSING_STATUSES as unknown as [string, ...string[]])
    .optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "originalName", "fileSize"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

