import { NextRequest, NextResponse } from "next/server";
import { executeTool, toolDefinitions } from "@/lib/tools";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const limiter = rateLimit({ maxRequests: 60, windowMs: 60000 });

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const { allowed, remaining } = await limiter(`tools:${ip}`);
    
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again in a minute." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-Correlation-ID": correlationId } }
      );
    }
    
    const body = await request.json();
    const { command, args = {} } = body;
    
    if (!command || typeof command !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid command" },
        { status: 400, headers: { "X-Correlation-ID": correlationId } }
      );
    }
    
    const sanitizedCommand = command.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const result = await executeTool(sanitizedCommand, args, { correlationId });
    
    const response = NextResponse.json(
      { ...result, correlationId },
      { status: result.success ? 200 : 400 }
    );
    
    response.headers.set("X-Correlation-ID", correlationId);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-Response-Time", `${Date.now() - startTime}ms`);
    
    return response;
  } catch (error) {
    logger.error("Tools API error", error instanceof Error ? error : new Error(String(error)), { correlationId });
    return NextResponse.json(
      { success: false, error: "Internal server error", correlationId },
      { status: 500, headers: { "X-Correlation-ID": correlationId } }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    tools: toolDefinitions,
    categories: ["reviews", "security", "repos", "queue", "analytics", "github", "system"],
    version: "1.0.0",
  });
}
