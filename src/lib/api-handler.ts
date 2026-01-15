import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from './logger';
import { handleError, ValidationError } from './errors';
import { rateLimit, getClientIdentifier } from './rate-limit';
import { randomUUID } from 'crypto';

export interface ApiHandlerOptions {
  rateLimit?: { windowMs: number; maxRequests: number };
  requireAuth?: boolean;
  validateBody?: z.ZodSchema;
  validateQuery?: z.ZodSchema;
}

export function apiHandler(
  handler: (req: NextRequest, context: { params?: Record<string, string> }) => Promise<Response>,
  options: ApiHandlerOptions = {}
) {
  return async (req: NextRequest, context: { params?: Record<string, string> } = {}) => {
    const requestId = randomUUID();
    logger.setContext({ requestId, method: req.method, url: req.url });

    try {
      // Rate limiting
      if (options.rateLimit) {
        const limiter = rateLimit(options.rateLimit);
        const identifier = getClientIdentifier(req);
        const result = limiter(identifier);

        if (!result.allowed) {
          return NextResponse.json(
            { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
              },
            }
          );
        }
      }

      // Body validation
      if (options.validateBody && req.method !== 'GET') {
        const body = await req.json();
        const result = options.validateBody.safeParse(body);
        if (!result.success) {
          throw new ValidationError(result.error);
        }
      }

      // Query validation
      if (options.validateQuery) {
        const url = new URL(req.url);
        const query = Object.fromEntries(url.searchParams);
        const result = options.validateQuery.safeParse(query);
        if (!result.success) {
          throw new ValidationError(result.error);
        }
      }

      const response = await handler(req, context);
      logger.info('Request completed', { status: response.status });
      return response;

    } catch (error) {
      logger.error('Request failed', error);
      const errorResponse = handleError(error);
      return NextResponse.json(
        { error: errorResponse.error, code: errorResponse.code, details: errorResponse.details },
        { status: errorResponse.statusCode }
      );
    }
  };
}
