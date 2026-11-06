import type { Types } from "mongoose";

/** Pagination parameters for list queries */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** Paginated response metadata */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/** Standard API success response */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Array<{
    field?: string;
    message: string;
  }>;
}

/** Type for MongoDB ObjectId references */
export type ObjectIdRef = Types.ObjectId;
