import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function validateApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return false;
  }

  // Check against environment variable (comma-separated list)
  const validKeys = process.env.API_KEYS?.split(',') || [];

  // Constant-time comparison to prevent timing attacks
  return validKeys.some(key => {
    if (key.length !== apiKey.length) return false;
    try {
      return timingSafeEqual(Buffer.from(key), Buffer.from(apiKey));
    } catch {
      return false;
    }
  });
}

export function apiKeyMiddleware(req: NextRequest): NextResponse | null {
  if (!validateApiKey(req)) {
    return NextResponse.json(
      { error: 'Invalid or missing API key', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
  return null;
}
