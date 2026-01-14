// Simple TTL cache for reducing redundant API calls
const cache = new Map<string, { data: unknown; expires: number }>();

export function get<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function set(key: string, data: unknown, ttlMs: number = 60000): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs: number = 60000): Promise<T> {
  const existing = get<T>(key);
  if (existing !== undefined) return existing;
  const data = await fn();
  set(key, data, ttlMs);
  return data;
}

// Cleanup expired entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expires) cache.delete(key);
    }
  }, 300000); // Every 5 minutes
}
