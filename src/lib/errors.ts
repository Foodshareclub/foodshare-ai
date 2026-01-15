import { z } from 'zod';

export class ValidationError extends Error {
  constructor(public errors: z.ZodError) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export function handleError(error: unknown) {
  if (error instanceof ValidationError) {
    return {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.errors.issues,
      statusCode: 400,
    };
  }

  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      meta: error.meta,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    };
  }

  return {
    error: 'Unknown error',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  };
}
