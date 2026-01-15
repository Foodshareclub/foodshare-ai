import { createClient } from "@/lib/supabase/server";

export type AuditAction =
  | "review.created"
  | "review.completed"
  | "review.failed"
  | "repo.added"
  | "repo.removed"
  | "config.updated"
  | "scan.started"
  | "scan.completed"
  | "user.login"
  | "user.logout"
  | "webhook.received"
  | "api.rate_limited";

interface AuditLogEntry {
  action: AuditAction;
  actor_id?: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export async function audit(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action: entry.action,
      actor_id: entry.actor_id,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      metadata: entry.metadata,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Don't fail operations due to audit logging
    console.error("Audit log failed:", entry.action);
  }
}

export async function getAuditLogs(filters?: {
  action?: AuditAction;
  actor_id?: string;
  resource_type?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters?.limit || 100);

  if (filters?.action) query = query.eq("action", filters.action);
  if (filters?.actor_id) query = query.eq("actor_id", filters.actor_id);
  if (filters?.resource_type) query = query.eq("resource_type", filters.resource_type);
  if (filters?.from) query = query.gte("created_at", filters.from.toISOString());
  if (filters?.to) query = query.lte("created_at", filters.to.toISOString());

  const { data } = await query;
  return data || [];
}
