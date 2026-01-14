import { createClient } from "./supabase/server";

export interface ReviewJob {
  id: string;
  repo_full_name: string;
  pr_number: number;
  owner: string;
  repo: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  analysis?: unknown;
  error?: string;
  created_at: string;
}

const retryDelay = (attempt: number) => Math.min(30000 * Math.pow(4, attempt), 480000);

export async function enqueueReview(owner: string, repo: string, prNumber: number, analysis?: unknown): Promise<ReviewJob> {
  const supabase = await createClient();
  const fullName = `${owner}/${repo}`;

  const { data: existing } = await supabase
    .from("review_jobs")
    .select("id")
    .eq("repo_full_name", fullName)
    .eq("pr_number", prNumber)
    .in("status", ["pending", "processing"])
    .single();

  if (existing) throw new Error("Review already queued");

  const { data, error } = await supabase
    .from("review_jobs")
    .insert({ repo_full_name: fullName, pr_number: prNumber, owner, repo, analysis })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function claimJob(): Promise<ReviewJob | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("review_jobs")
    .update({ status: "processing", started_at: now, updated_at: now })
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .select()
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw error;
  return data;
}

export async function completeJob(jobId: string): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("review_jobs").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", jobId);
}

export async function failJob(jobId: string, error: string, attempts: number, maxAttempts: number): Promise<boolean> {
  const supabase = await createClient();
  const shouldRetry = attempts < maxAttempts;
  const now = new Date().toISOString();

  await supabase.from("review_jobs").update({
    status: shouldRetry ? "pending" : "failed",
    error,
    attempts,
    updated_at: now,
    next_retry_at: shouldRetry ? new Date(Date.now() + retryDelay(attempts)).toISOString() : null,
  }).eq("id", jobId);

  return !shouldRetry;
}

export async function getJobStats() {
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pending, processing, failed, completed] = await Promise.all([
    supabase.from("review_jobs").select("id", { count: "exact" }).eq("status", "pending"),
    supabase.from("review_jobs").select("id", { count: "exact" }).eq("status", "processing"),
    supabase.from("review_jobs").select("id", { count: "exact" }).eq("status", "failed"),
    supabase.from("review_jobs").select("id", { count: "exact" }).eq("status", "completed").gte("completed_at", today.toISOString()),
  ]);

  return { pending: pending.count || 0, processing: processing.count || 0, failed: failed.count || 0, completed_today: completed.count || 0 };
}
