// Typed application errors (CODING_RULES §6.1)
// A single AppError base lets the global error handler map any thrown error
// to the correct HTTP status + machine-readable code without per-module glue.

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = new.target.name
    Error.captureStackTrace?.(this, new.target)
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Validation failed') {
    super(400, message, 'VALIDATION_ERROR', details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(403, message, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND')
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, message, code)
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message = 'Plan limit reached', code = 'PLAN_LIMIT_REACHED') {
    super(402, message, code)
  }
}
