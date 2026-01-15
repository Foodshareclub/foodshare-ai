import { NextRequest } from "next/server";
import { getJobStats } from "@/lib/queue";
import { ok } from "@/lib/api";

export async function GET(request: NextRequest) {
  const detailed = request.nextUrl.searchParams.get("detailed") === "true";
  if (!detailed) return ok({ status: "ok" });

  try {
    const [queue, llmCheck] = await Promise.all([
      getJobStats(),
      checkLLM(),
    ]);
    return ok({ status: "ok", queue, llm: llmCheck, timestamp: new Date().toISOString() });
  } catch {
    return ok({ status: "degraded", error: "health check failed" });
  }
}

async function checkLLM(): Promise<{ status: string; provider: string }> {
  const host = process.env.OLLAMA_HOST;
  const provider = process.env.LLM_PROVIDER || "groq";
  if (provider !== "ollama" || !host) return { status: "ok", provider };

  try {
    const headers: Record<string, string> = {};
    if (process.env.CF_ACCESS_CLIENT_ID) {
      headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET || "";
    }
    const res = await fetch(`${host}/api/tags`, { headers, signal: AbortSignal.timeout(5000) });
    return { status: res.ok ? "ok" : "error", provider };
  } catch {
    return { status: "unreachable", provider };
  }
}
