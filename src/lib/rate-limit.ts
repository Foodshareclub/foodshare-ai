import { NextRequest } from 'next/server';

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 60,
};

export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests } = { ...defaultConfig, ...config };

  return (identifier: string): { allowed: boolean; remaining: number; resetAt: number } => {
    const now = Date.now();
    const record = store[identifier];

    if (!record || now > record.resetAt) {
      store[identifier] = { count: 1, resetAt: now + windowMs };
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    record.count++;

    if (record.count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt };
  };
}

export function getClientIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]! : req.headers.get('x-real-ip') || 'unknown';
  return ip;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key]!.resetAt < now) delete store[key];
  });
}, 300000);
