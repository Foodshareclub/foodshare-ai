import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { executeTool, toolDefinitions } from "@/lib/tools";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const limiter = rateLimit({ maxRequests: 30, windowMs: 60000 });

function parseToolCall(response: string): { tool: string; params: Record<string, string> } | null {
  const match = response.match(/\[TOOL:([\w-]+)(?:\s+(.+?))?\]/);
  if (!match) return null;
  const params: Record<string, string> = {};
  if (match[2]) {
    for (const m of match[2].matchAll(/(\w+)="([^"]+)"/g)) {
      if (m[1] && m[2]) params[m[1]] = m[2];
    }
  }
  return { tool: match[1] || "", params };
}

const toolList = toolDefinitions.map(t => `${t.name}(${t.params.join(", ")})`).join(", ");

const SYSTEM_PROMPT = `You are an AI assistant for FoodShare AI code review platform. Use tools to fetch real data.

## Tool Syntax
[TOOL:tool-name param1="value1" param2="value2"]

## Tools: ${toolList}

## Rules
1. ALWAYS use tools for data - never fabricate
2. Call ONE tool per response
3. Be concise and helpful

## Examples
"Show reviews" → [TOOL:reviews limit="5"]
"Scan foodshare-ios" → [TOOL:trigger-scan repo="Foodshareclub/foodshare-ios"]
"Stats" → [TOOL:stats]`;

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const { allowed } = await limiter(`chat:${ip}`);
    
    if (!allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    
    const { message, history = [] } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }
    
    if (message.trim().toLowerCase() === "/help") {
      const result = await executeTool("help", {}, { correlationId });
      return NextResponse.json({ response: result.data || result.error });
    }
    
    const conv = history.slice(-6).map((m: { role: string; content: string }) => 
      `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
    ).join("\n");
    
    const prompt = `${SYSTEM_PROMPT}\n\n${conv ? `Recent:\n${conv}\n\n` : ""}User: ${message}\nAssistant:`;
    let response = await chat(prompt, { temperature: 0.2 });
    
    const toolCall = parseToolCall(response);
    if (toolCall) {
      const result = await executeTool(toolCall.tool, toolCall.params, { correlationId });
      
      if (result.success && result.data) {
        const followUp = `${prompt} ${response}\n\nResult:\n${result.data}\n\nSummarize helpfully:`;
        response = await chat(followUp, { temperature: 0.4 });
      } else {
        response = result.error || "Command failed";
      }
    }
    
    response = response.replace(/\[TOOL:[^\]]+\]/g, "").trim();
    return NextResponse.json({ response, correlationId });
  } catch (error) {
    logger.error("Chat error", error instanceof Error ? error : new Error(String(error)), { correlationId });
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
