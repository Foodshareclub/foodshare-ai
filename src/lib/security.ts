import { NextRequest, NextResponse } from 'next/server';

export function securityHeaders() {
  const headers = new Headers();
  
  // Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');
  
  // XSS protection
  headers.set('X-Content-Type-Options', 'nosniff');
  
  // Referrer policy
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.github.com;"
  );
  
  return headers;
}

export function corsHeaders(origin?: string) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  const headers = new Headers();
  
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Max-Age', '86400');
  }
  
  return headers;
}

export function addSecurityHeaders(response: NextResponse) {
  const secHeaders = securityHeaders();
  secHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}
