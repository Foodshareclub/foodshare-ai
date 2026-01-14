import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getPullRequestFiles } from "@/lib/github";
import { analyzePR, PRContext } from "@/lib/analysis";
import { enqueueReview } from "@/lib/queue";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;
  return signature === expected;
}

async function triggerWorker() {
  // Fire and forget - trigger worker to process queue
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL;
  if (baseUrl) {
    fetch(`${baseUrl}/api/worker`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${process.env.CRON_SECRET || ""}`,
        "Content-Type": "application/json",
      },
    }).catch(() => {}); // Ignore errors
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");

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
      .select("enabled, auto_review")
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

    // Analyze PR
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

    // Enqueue instead of direct processing
    try {
      const job = await enqueueReview(repo.owner.login, repo.name, pr.number, analysis);
      
      // Trigger worker asynchronously
      triggerWorker();

      return NextResponse.json({
        message: "Review queued",
        job_id: job.id,
        pr_number: pr.number,
        analysis,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Review already queued") {
        return NextResponse.json({ message: "Already queued", pr_number: pr.number });
      }
      throw err;
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
