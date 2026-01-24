import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { chat } from "@/lib/llm";
import { createReviewComment } from "@/lib/github";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.error("GITHUB_WEBHOOK_SECRET not configured - rejecting webhook");
    return false;
  }
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

const CHAT_PROMPT = `You are an AI code reviewer assistant. A developer is replying to your review comment.
Be helpful, concise, and provide code examples when relevant.

Original review comment:
{original_comment}

Developer's reply:
{reply}

Respond helpfully. If they ask for clarification, explain. If they disagree, consider their point.
If they ask for a code fix, provide it in a code block.`;

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!verifySignature(payload, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = request.headers.get("x-github-event");
    if (event !== "issue_comment" && event !== "pull_request_review_comment") {
      return NextResponse.json({ message: "Ignored event" });
    }

    const body = JSON.parse(payload);
    
    if (body.action !== "created") {
      return NextResponse.json({ message: "Ignored action" });
    }

    const comment = body.comment;
    const isReplyToBot = comment.in_reply_to_id && 
      (comment.body.includes("@foodshare-ai") || comment.body.toLowerCase().startsWith("@ai"));

    if (!isReplyToBot) {
      return NextResponse.json({ message: "Not a reply to bot" });
    }

    const repo = body.repository;
    const prNumber = body.pull_request?.number || body.issue?.number;

    const prompt = CHAT_PROMPT
      .replace("{original_comment}", comment.original_comment?.body || "Previous review comment")
      .replace("{reply}", comment.body);

    const response = await chat(prompt, { useReviewModel: true });

    await createReviewComment(
      repo.owner.login,
      repo.name,
      prNumber,
      response,
      comment.id
    );

    return NextResponse.json({ message: "Replied", pr: prNumber });
  } catch (error) {
    console.error("Comment webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
