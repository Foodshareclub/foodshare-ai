import { NextRequest, NextResponse } from 'next/server';

export function validateApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    return false;
  }

  // Check against environment variable (comma-separated list)
  const validKeys = process.env.API_KEYS?.split(',') || [];
  return validKeys.includes(apiKey);
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
