export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errors?: Array<{ field?: string; message: string }>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 400,
    errors?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
