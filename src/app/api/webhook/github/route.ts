import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { reviewAndPost } from "@/lib/review";

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
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const event = request.headers.get("x-github-event");
    const body = JSON.parse(payload);

    // Only handle PR events
    if (event !== "pull_request") {
      return NextResponse.json({ message: "Ignored event" });
    }

    // Only review on opened or synchronized (new commits pushed)
    const action = body.action;
    if (!["opened", "synchronize"].includes(action)) {
      return NextResponse.json({ message: `Ignored action: ${action}` });
    }

    const pr = body.pull_request;
    const repo = body.repository;

    console.log(
      `Processing PR #${pr.number} on ${repo.full_name} (action: ${action})`
    );

    // Process review in background
    // Note: In production, use a proper job queue
    reviewAndPost(repo.owner.login, repo.name, pr.number).catch((err) => {
      console.error("Background review failed:", err);
    });

    return NextResponse.json({
      message: "Review triggered",
      pr_number: pr.number,
      repo: repo.full_name,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}
