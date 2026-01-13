import { NextRequest, NextResponse } from "next/server";
import { analyzePR, PRContext } from "@/lib/analysis";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pr = body.pull_request || body;

    const ctx: PRContext = {
      files_changed: pr.changed_files || body.files_changed || 0,
      additions: pr.additions || body.additions || 0,
      deletions: pr.deletions || body.deletions || 0,
      title: pr.title || body.title || "",
      labels: (pr.labels || body.labels || []).map((l: any) => l.name || l),
      base_branch: pr.base?.ref || body.base_branch || "main",
      files: body.files || [],
    };

    const decision = analyzePR(ctx);

    return NextResponse.json({
      ...decision,
      total_changes: ctx.additions + ctx.deletions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
