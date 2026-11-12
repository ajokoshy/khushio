export class AppError extends Error {
  constructor(message: string, public readonly status = 500, public readonly code = "INTERNAL") {
    super(message);
  }
}
export class UnauthorizedError extends AppError { constructor(m = "Authentication required") { super(m, 401, "UNAUTHORIZED"); } }
export class NotFoundError extends AppError { constructor(m = "Not found") { super(m, 404, "NOT_FOUND"); } }
export class ForbiddenError extends AppError { constructor(m = "Forbidden") { super(m, 403, "FORBIDDEN"); } }
export class ConflictError extends AppError { constructor(m = "Conflict") { super(m, 409, "CONFLICT"); } }
/** `fields` maps form field names to messages, so a form can show each one beside its input. */
export class ValidationError extends AppError {
  constructor(m = "Invalid input", public readonly fields: Readonly<Record<string, string>> = {}) {
    super(m, 422, "VALIDATION");
  }
}
