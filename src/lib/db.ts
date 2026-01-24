import { createClient as createServerClient } from "./supabase/server";

// Re-export for convenience
export const db = {
  async client() {
    return createServerClient();
  },

  async query<T>(table: string, query: (q: any) => any): Promise<T[]> {
    const supabase = await createServerClient();
    const { data, error } = await query(supabase.from(table));
    if (error) throw error;
    return data || [];
  },

  async queryOne<T>(table: string, query: (q: any) => any): Promise<T | null> {
    const supabase = await createServerClient();
    const { data, error } = await query(supabase.from(table)).single();
    if (error?.code === "PGRST116") return null;
    if (error) throw error;
    return data;
  },

  async insert<T>(table: string, row: Partial<T>): Promise<T> {
    const supabase = await createServerClient();
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async update<T>(table: string, id: string, row: Partial<T>): Promise<T> {
    const supabase = await createServerClient();
    const { data, error } = await supabase.from(table).update(row).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async upsert<T>(table: string, row: Partial<T>, onConflict: string): Promise<T> {
    const supabase = await createServerClient();
    const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select().single();
    if (error) throw error;
    return data;
  },
};

// Table names (snake_case)
export const tables = {
  repoConfigs: "repo_configs",
  reviewHistory: "review_history",
  reviewJobs: "review_jobs",
  codeReviews: "code_reviews",
  apiKeys: "api_keys",
  apiLogs: "api_logs",
  webhooks: "webhooks",
  webhookLogs: "webhook_logs",
  conversations: "conversations",
  messages: "messages",
  profiles: "profiles",
  notifications: "notifications",
  analyticsInsights: "analytics_insights",
  passkeys: "passkeys",
  passkeyChallenges: "passkey_challenges",
  reviewLearnings: "review_learnings",
  pullRequests: "pull_requests",
} as const;
