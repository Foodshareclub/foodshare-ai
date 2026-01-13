import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { ReviewCategory } from "@/lib/review/models";
import { getPullRequestFiles } from "@/lib/github";
import { analyzePR, PRContext } from "@/lib/analysis";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;
  return signature === expected;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");

    // Allow ping without signature for testing
    if (event === "ping") {
      return NextResponse.json({ message: "Pong", status: "ok" });
    }

    if (!verifySignature(payload, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(payload);
    if (event !== "pull_request") return NextResponse.json({ message: "Ignored event" });
    if (!["opened", "synchronize"].includes(body.action)) {
      return NextResponse.json({ message: `Ignored action: ${body.action}` });
    }

    const pr = body.pull_request;
    const repo = body.repository;
    const fullName = repo.full_name;

    const supabase = await createClient();
    const { data: config } = await supabase
      .from("repo_configs")
      .select("enabled, auto_review, categories")
      .eq("full_name", fullName)
      .single();

    if (!config?.enabled || !config?.auto_review) {
      return NextResponse.json({ message: "Auto-review disabled" });
    }

    // Get files for analysis
    let files: string[] = [];
    try {
      const prFiles = await getPullRequestFiles(repo.owner.login, repo.name, pr.number);
      files = prFiles.map((f: any) => f.filename);
    } catch { /* ignore */ }

    // Analyze PR risk
    const ctx: PRContext = {
      files_changed: pr.changed_files || 0,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      title: pr.title || "",
      labels: (pr.labels || []).map((l: any) => l.name),
      base_branch: pr.base?.ref || "main",
      files,
    };
    const analysis = analyzePR(ctx);

    if (!analysis.should_review) {
      return NextResponse.json({ message: "Skipped", analysis });
    }

    console.log(`PR #${pr.number}: ${analysis.depth} review (${analysis.priority}) - ${analysis.reasons.join(", ")}`);

    const categories = (config.categories || []).map((c: string) => c as ReviewCategory);

    // Trigger review with analysis-driven options
    reviewAndPost(repo.owner.login, repo.name, pr.number, categories, {
      depth: analysis.depth,
      focus_areas: analysis.focus_areas,
    })
      .then(async ({ review, headSha, isIncremental }) => {
        const supabase = await createClient();
        await supabase.from("review_history").insert({
          repo_full_name: fullName,
          pr_number: pr.number,
          status: "completed",
          result: { ...review, _analysis: analysis },
          head_sha: headSha,
          is_incremental: isIncremental,
        });
      })
      .catch(async (err) => {
        console.error("Review failed:", err);
        const supabase = await createClient();
        await supabase.from("review_history").insert({
          repo_full_name: fullName,
          pr_number: pr.number,
          status: "failed",
          result: { error: err.message, _analysis: analysis },
        });
      });

    return NextResponse.json({ message: "Review triggered", pr_number: pr.number, analysis });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
