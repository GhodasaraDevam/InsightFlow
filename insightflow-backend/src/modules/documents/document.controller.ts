import type { Request, Response, NextFunction } from "express";
import { documentService } from "./document.service.js";
import { listDocumentsQuerySchema } from "./document.validator.js";
import { AppError } from "../../utils/app-error.util.js";

export class DocumentController {
  public async upload(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const document = await documentService.uploadDocument(userId, req.file);

      res.status(201).json({
        success: true,
        message: "Document uploaded successfully",
        data: {
          document,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const query = listDocumentsQuerySchema.parse(req.query);
      const result = await documentService.listDocuments(userId, query);

      res.status(200).json({
        success: true,
        message: "Documents retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const documentId = req.params.id as string;
      const document = await documentService.getDocumentById(userId, documentId);

      res.status(200).json({
        success: true,
        message: "Document retrieved successfully",
        data: {
          document,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async download(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const documentId = req.params.id as string;
      const downloadData = await documentService.generateDownloadUrl(
        userId,
        documentId
      );

      res.status(200).json({
        success: true,
        message: "Temporary download URL generated successfully",
        data: downloadData,
      });
    } catch (error) {
      next(error);
    }
  }

  public async delete(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("Authentication required", 401);
      }

      const documentId = req.params.id as string;
      const result = await documentService.deleteDocument(userId, documentId);

      res.status(200).json({
        success: true,
        message: "Document deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const documentController = new DocumentController();

