import { NextRequest } from 'next/server';
import { createClient, RedisClientType } from 'redis';

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const memoryStore: RateLimitStore = {};

let redis: RedisClientType | null = null;
let redisConnecting = false;

async function getRedis(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL || process.env.REDIS_URL.includes('provisioning')) return null;
  if (redis?.isOpen) return redis;
  if (redisConnecting) return null;
  
  try {
    redisConnecting = true;
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', () => {});
    await redis.connect();
    return redis;
  } catch {
    redis = null;
    return null;
  } finally {
    redisConnecting = false;
  }
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 60,
};

export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests } = { ...defaultConfig, ...config };

  return async (identifier: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
    const now = Date.now();
    const client = await getRedis();

    if (client) {
      try {
        const key = `ratelimit:${identifier}`;
        const windowSec = Math.ceil(windowMs / 1000);
        
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, windowSec);
        }
        
        const ttl = await client.ttl(key);
        const resetAt = now + (ttl > 0 ? ttl * 1000 : windowMs);
        
        return {
          allowed: count <= maxRequests,
          remaining: Math.max(0, maxRequests - count),
          resetAt,
        };
      } catch {
        // Fall through to memory store
      }
    }

    // Memory fallback
    const record = memoryStore[identifier];
    if (!record || now > record.resetAt) {
      memoryStore[identifier] = { count: 1, resetAt: now + windowMs };
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    record.count++;
    return {
      allowed: record.count <= maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
      resetAt: record.resetAt,
    };
  };
}

export function getClientIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]! : req.headers.get('x-real-ip') || 'unknown';
  return ip;
}

// Cleanup memory store every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(memoryStore).forEach(key => {
    if (memoryStore[key]!.resetAt < now) delete memoryStore[key];
  });
}, 300000);
