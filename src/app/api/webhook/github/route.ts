import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { ReviewCategory } from "@/lib/review/models";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("GITHUB_WEBHOOK_SECRET not set, skipping verification");
    return true;
  }
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex")}`;

  return signature === expected;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!verifySignature(payload, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = request.headers.get("x-github-event");
    const body = JSON.parse(payload);

    if (event !== "pull_request") {
      return NextResponse.json({ message: "Ignored event" });
    }

    const action = body.action;
    if (!["opened", "synchronize"].includes(action)) {
      return NextResponse.json({ message: `Ignored action: ${action}` });
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
      return NextResponse.json({ message: "Auto-review disabled for this repo" });
    }

    console.log(`Processing PR #${pr.number} on ${fullName} (action: ${action})`);

    const categories = (config.categories || []).map((c: string) => c as ReviewCategory);

    reviewAndPost(repo.owner.login, repo.name, pr.number, categories)
      .then(async ({ review, headSha, isIncremental }) => {
        const supabase = await createClient();
        await supabase.from("review_history").insert({
          repo_full_name: fullName,
          pr_number: pr.number,
          status: "completed",
          result: JSON.stringify(review),
          head_sha: headSha,
          is_incremental: isIncremental,
        });
      })
      .catch(async (err) => {
        console.error("Background review failed:", err);
        const supabase = await createClient();
        await supabase.from("review_history").insert({
          repo_full_name: fullName,
          pr_number: pr.number,
          status: "failed",
          result: JSON.stringify({ error: err.message }),
        });
      });

    return NextResponse.json({
      message: "Review triggered",
      pr_number: pr.number,
      repo: fullName,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}
