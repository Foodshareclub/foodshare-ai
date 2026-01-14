import { NextRequest, NextResponse } from "next/server";
import { claimJob, completeJob, failJob } from "@/lib/queue";
import { reviewAndPost } from "@/lib/review";
import { notifyReviewFailed, notifyReviewCompleted } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { ReviewCategory } from "@/lib/review/models";

// Cron or manual trigger to process queued jobs
export async function POST(request: NextRequest) {
  // Simple auth for cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const processed: string[] = [];
  const errors: string[] = [];
  let job = await claimJob();

  while (job) {
    try {
      const supabase = await createClient();
      const { data: config } = await supabase
        .from("repo_configs")
        .select("categories")
        .eq("full_name", job.repo_full_name)
        .single();

      const categories = (config?.categories || ["security", "bug", "performance"]).map((c: string) => c as ReviewCategory);
      const options = job.analysis ? { depth: job.analysis.depth, focus_areas: job.analysis.focus_areas } : undefined;

      const result = await reviewAndPost(job.owner, job.repo, job.pr_number, categories, options);

      // Save to history
      await supabase.from("review_history").insert({
        repo_full_name: job.repo_full_name,
        pr_number: job.pr_number,
        status: "completed",
        result: { ...result.review, _analysis: job.analysis },
        head_sha: result.headSha,
        is_incremental: result.isIncremental,
      });

      await completeJob(job.id);
      await notifyReviewCompleted(job.repo_full_name, job.pr_number, result.review.line_comments?.length || 0);
      processed.push(`${job.repo_full_name}#${job.pr_number}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const permanentlyFailed = await failJob(job.id, error, job.attempts + 1, job.max_attempts);
      await notifyReviewFailed(job.repo_full_name, job.pr_number, error, job.attempts + 1, !permanentlyFailed);
      errors.push(`${job.repo_full_name}#${job.pr_number}: ${error}`);
    }

    // Get next job (process up to 5 per invocation)
    if (processed.length + errors.length >= 5) break;
    job = await claimJob();
  }

  return NextResponse.json({ processed, errors, count: processed.length });
}
