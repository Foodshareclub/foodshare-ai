import { NextRequest } from "next/server";
import { getJobStats } from "@/lib/queue";
import { ok } from "@/lib/api";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("detailed") !== "true") return ok({ status: "ok" });
  try {
    return ok({ status: "ok", queue: await getJobStats(), timestamp: new Date().toISOString() });
  } catch {
    return ok({ status: "degraded", error: "queue unavailable" });
  }
}
