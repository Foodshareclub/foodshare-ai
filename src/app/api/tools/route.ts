import { NextRequest, NextResponse } from "next/server";
import { executeTool, toolDefinitions, toolsHealthCheck } from "@/lib/tools";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const limiter = rateLimit({ maxRequests: 120, windowMs: 60000 });

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  EXTERNAL_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
             request.headers.get("x-real-ip") || "unknown";
  
  try {
    const { allowed, remaining } = await limiter(`tools:${ip}`);
    
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded", code: "RATE_LIMITED", correlationId },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "Retry-After": "60" } }
      );
    }
    
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR", correlationId },
        { status: 400 }
      );
    }
    
    const { command, args = {} } = body;
    
    if (!command || typeof command !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid 'command' field", code: "VALIDATION_ERROR", correlationId },
        { status: 400 }
      );
    }
    
    if (args && typeof args !== "object") {
      return NextResponse.json(
        { success: false, error: "'args' must be an object", code: "VALIDATION_ERROR", correlationId },
        { status: 400 }
      );
    }
    
    const sanitizedCommand = command.toLowerCase().replace(/[^a-z0-9-]/g, "");
    
    const result = await executeTool(sanitizedCommand, args, { 
      correlationId, 
      ip,
      permissions: ["read", "write"], // TODO: get from auth
    });
    
    const status = result.success ? 200 : (ERROR_STATUS[result.code || "INTERNAL_ERROR"] || 500);
    
    return NextResponse.json(
      { ...result, correlationId },
      { 
        status,
        headers: {
          "X-Correlation-ID": correlationId,
          "X-RateLimit-Remaining": String(remaining),
          "X-Response-Time": `${Date.now() - startTime}ms`,
        }
      }
    );
  } catch (error) {
    logger.error("Tools API error", error instanceof Error ? error : new Error(String(error)), { correlationId, ip });
    
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR", correlationId },
      { status: 500, headers: { "X-Correlation-ID": correlationId } }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Health check endpoint
  if (searchParams.get("health") === "true") {
    const health = await toolsHealthCheck();
    return NextResponse.json(health, { status: health.healthy ? 200 : 503 });
  }
  
  return NextResponse.json({
    tools: toolDefinitions,
    categories: ["reviews", "security", "repos", "queue", "analytics", "github", "system"],
    permissions: ["read", "write", "admin"],
    version: "2.0.0",
  });
}
