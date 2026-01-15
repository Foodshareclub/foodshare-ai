import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs, AuditAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  
  const logs = await getAuditLogs({
    action: (params.get("action") || undefined) as AuditAction | undefined,
    actor_id: params.get("actor_id") || undefined,
    resource_type: params.get("resource_type") || undefined,
    limit: params.get("limit") ? parseInt(params.get("limit")!) : 100,
  });

  return NextResponse.json({ logs });
}
