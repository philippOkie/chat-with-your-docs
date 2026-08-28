export type ErrorCode =
  | "DATABASE_ERROR"
  | "DOCUMENT_NOT_READY"
  | "NOT_FOUND"
  | "PARSING_ERROR"
  | "PROVIDER_ERROR"
  | "QUEUE_ERROR"
  | "STORAGE_ERROR"
  | "UNEXPECTED_ERROR"
  | "VALIDATION_ERROR";

type AppErrorOptions = {
  cause?: unknown;
  code: ErrorCode;
  message: string;
  retryable?: boolean;
  statusCode?: number;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor({
    cause,
    code,
    message,
    retryable = false,
    statusCode = 500,
  }: AppErrorOptions) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }

  toSafeResponse() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
