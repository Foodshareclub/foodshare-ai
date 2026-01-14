import { NextRequest, NextResponse } from "next/server";
import { getJobStats } from "@/lib/queue";

export async function GET(request: NextRequest) {
  const detailed = request.nextUrl.searchParams.get("detailed") === "true";
  
  if (detailed) {
    try {
      const queue = await getJobStats();
      return NextResponse.json({ status: "ok", queue, timestamp: new Date().toISOString() });
    } catch {
      return NextResponse.json({ status: "degraded", error: "queue unavailable" });
    }
  }
  
  return NextResponse.json({ status: "ok" });
}
