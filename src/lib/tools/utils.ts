import { AuditEntry } from "./types";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

// In-memory cache with TTL
const cache = new Map<string, { data: string; expires: number }>();

export function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: string, ttlSeconds: number): void {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
  
  // Cleanup old entries periodically
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k);
    }
  }
}

export function cacheKey(tool: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return `tool:${tool}:${sorted}`;
}

// Audit logging
const auditBuffer: AuditEntry[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

export function audit(entry: AuditEntry): void {
  auditBuffer.push(entry);
  logger.info("Tool audit", { ...entry, params: sanitizeParams(entry.params) });
  
  // Batch flush to database
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushAuditBuffer, 5000);
  }
}

async function flushAuditBuffer(): Promise<void> {
  flushTimeout = null;
  if (auditBuffer.length === 0) return;
  
  const entries = auditBuffer.splice(0, auditBuffer.length);
  
  try {
    const supabase = await createClient();
    await supabase.from("tool_audit_logs").insert(
      entries.map(e => ({
        correlation_id: e.correlationId,
        tool_name: e.tool,
        user_id: e.userId,
        ip_address: e.ip,
        params: sanitizeParams(e.params),
        success: e.success,
        error_message: e.error,
        duration_ms: e.duration,
        created_at: e.timestamp,
      }))
    );
  } catch (err) {
    // Log but don't fail - audit is best-effort
    logger.error("Failed to flush audit logs", err instanceof Error ? err : new Error(String(err)));
  }
}

function sanitizeParams(params: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    // Redact sensitive-looking values
    if (/token|secret|password|key|auth/i.test(k)) {
      sanitized[k] = "[REDACTED]";
    } else {
      sanitized[k] = v.length > 200 ? v.slice(0, 200) + "..." : v;
    }
  }
  return sanitized;
}

// Permission check
export function hasPermission(required: string, granted: string[]): boolean {
  const hierarchy = { read: 1, write: 2, admin: 3 };
  const requiredLevel = hierarchy[required as keyof typeof hierarchy] || 0;
  const maxGranted = Math.max(...granted.map(p => hierarchy[p as keyof typeof hierarchy] || 0));
  return maxGranted >= requiredLevel;
}

// Health check for tools subsystem
export async function toolsHealthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
  const checks: Record<string, unknown> = {
    cacheSize: cache.size,
    auditBufferSize: auditBuffer.length,
  };
  
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("repo_configs").select("id").limit(1);
    checks.database = error ? "error" : "ok";
  } catch {
    checks.database = "error";
  }
  
  return {
    healthy: checks.database === "ok",
    details: checks,
  };
}
