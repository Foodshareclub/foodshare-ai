import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { ReviewCategory } from "@/lib/review/models";
import { getPullRequestFiles } from "@/lib/github";

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

// Intelligent analysis for review depth
function analyzeReviewDepth(pr: any, files: string[]): { depth: "quick" | "standard" | "deep"; priority: string; reasons: string[] } {
  const reasons: string[] = [];
  let riskScore = 0;
  const totalChanges = (pr.additions || 0) + (pr.deletions || 0);
  const titleLower = (pr.title || "").toLowerCase();

  // Size analysis
  if (totalChanges > 500) { riskScore += 3; reasons.push(`Large: ${totalChanges} lines`); }
  else if (totalChanges > 200) { riskScore += 2; }
  if (pr.changed_files > 20) { riskScore += 2; reasons.push(`${pr.changed_files} files`); }

  // Sensitive patterns
  const sensitivePatterns = [/auth/i, /secret/i, /password/i, /token/i, /payment/i, /security/i, /middleware/i, /migration/i];
  if (sensitivePatterns.some(p => p.test(pr.title))) { riskScore += 3; reasons.push("Sensitive title"); }
  if (files.some(f => sensitivePatterns.some(p => p.test(f)))) { riskScore += 2; reasons.push("Sensitive files"); }

  // Keywords
  if (titleLower.includes("security") || titleLower.includes("vulnerability")) { riskScore += 4; reasons.push("Security fix"); }
  if (titleLower.includes("fix") || titleLower.includes("bug")) { riskScore += 1; }

  // API/route changes
  if (files.some(f => f.includes("route") || f.includes("api/"))) { riskScore += 1; reasons.push("API changes"); }

  const depth = riskScore >= 6 ? "deep" : riskScore >= 3 ? "standard" : "quick";
  const priority = riskScore >= 6 ? "critical" : riskScore >= 4 ? "high" : riskScore >= 2 ? "medium" : "low";

  return { depth, priority, reasons: reasons.length ? reasons : ["Standard changes"] };
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

    if (event === "ping") {
      return NextResponse.json({ message: "Pong" });
    }

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
      .select("enabled, auto_review, categories, ignore_paths, custom_instructions")
      .eq("full_name", fullName)
      .single();

    if (!config?.enabled || !config?.auto_review) {
      return NextResponse.json({ message: "Auto-review disabled for this repo" });
    }

    // Get file list for intelligent analysis
    let files: string[] = [];
    try {
      const prFiles = await getPullRequestFiles(repo.owner.login, repo.name, pr.number);
      files = prFiles.map((f: any) => f.filename);
    } catch { /* ignore */ }

    // Intelligent analysis
    const analysis = analyzeReviewDepth(pr, files);
    console.log(`PR #${pr.number} on ${fullName}: ${analysis.depth} review (${analysis.priority}) - ${analysis.reasons.join(", ")}`);

    const categories = (config.categories || []).map((c: string) => c as ReviewCategory);

    // Trigger review with analysis metadata
    reviewAndPost(repo.owner.login, repo.name, pr.number, categories)
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
        console.error("Background review failed:", err);
        const supabase = await createClient();
        await supabase.from("review_history").insert({
          repo_full_name: fullName,
          pr_number: pr.number,
          status: "failed",
          result: { error: err.message, _analysis: analysis },
        });
      });

    return NextResponse.json({
      message: "Review triggered",
      pr_number: pr.number,
      repo: fullName,
      analysis,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}
