export class InferShapeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "InferShapeError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
