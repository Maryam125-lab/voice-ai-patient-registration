export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(details: ErrorDetail[]) {
    super(422, "VALIDATION_ERROR", "One or more fields are invalid", details);
    this.name = "ValidationError";
  }
}
