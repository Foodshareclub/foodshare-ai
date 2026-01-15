import { z } from "zod";
import { Tool, ToolResult, ToolContext, ToolDefinition, Permission, toolError } from "./types";
import { reviewTools } from "./reviews";
import { securityTools } from "./security";
import { repoTools } from "./repos";
import { analyticsTools } from "./analytics";
import { githubTools } from "./github";
import { getCached, setCache, cacheKey, audit, hasPermission, toolsHealthCheck } from "./utils";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

// Combine all tools
const allTools: Tool[] = [
  ...reviewTools,
  ...securityTools,
  ...repoTools,
  ...analyticsTools,
  ...githubTools,
];

// Help tool
const helpTool: Tool = {
  name: "help",
  description: "Show all available commands",
  category: "system",
  permission: "read",
  params: [],
  schema: z.object({}),
  execute: async (_, ctx): Promise<ToolResult> => {
    const categories = {
      reviews: { icon: "📝", name: "Reviews" },
      security: { icon: "🛡️", name: "Security" },
      repos: { icon: "📁", name: "Repositories" },
      queue: { icon: "⚙️", name: "Queue" },
      analytics: { icon: "📊", name: "Analytics" },
      github: { icon: "🔗", name: "GitHub" },
      system: { icon: "❓", name: "System" },
    };
    
    const grouped: Record<string, Tool[]> = {};
    [...allTools, helpTool].forEach(t => {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category]!.push(t);
    });
    
    let output = "**Available Commands**\n\n";
    for (const [cat, catTools] of Object.entries(grouped)) {
      const info = categories[cat as keyof typeof categories] || { icon: "•", name: cat };
      output += `${info.icon} **${info.name}**\n`;
      output += catTools.map(t => {
        const params = t.params.map(p => p.required ? `<${p.name}>` : `[${p.name}]`).join(" ");
        const perm = t.permission !== "read" ? ` [${t.permission}]` : "";
        return `  \`/${t.name}${params ? " " + params : ""}\`${perm} - ${t.description}`;
      }).join("\n") + "\n\n";
    }
    
    output += `**Permission Levels:** read (default) < write < admin

**Tips:**
• Tab to autocomplete • ↑↓ to navigate
• Required params in <brackets>
• Optional params in [brackets]`;
    
    return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime } };
  }
};

// Export all tools
export const tools: Tool[] = [...allTools, helpTool];

// Client-side definitions
export const toolDefinitions: ToolDefinition[] = tools.map(t => ({
  name: t.name,
  description: t.description,
  category: t.category,
  params: t.params.map(p => p.required ? p.name : `${p.name}?`),
  permission: t.permission,
}));

// Per-tool rate limiters
const toolLimiters = new Map<string, ReturnType<typeof rateLimit>>();

function getToolLimiter(tool: Tool) {
  if (!tool.rateLimit) return null;
  if (!toolLimiters.has(tool.name)) {
    toolLimiters.set(tool.name, rateLimit({ maxRequests: tool.rateLimit.max, windowMs: tool.rateLimit.windowMs }));
  }
  return toolLimiters.get(tool.name)!;
}

// Execute a tool with full enterprise features
export async function executeTool(
  name: string,
  args: Record<string, string>,
  ctx: Partial<ToolContext> = {}
): Promise<ToolResult> {
  const startTime = Date.now();
  const correlationId = ctx.correlationId || crypto.randomUUID();
  const permissions = ctx.permissions || ["read", "write"]; // Default permissions
  const fullCtx: ToolContext = { ...ctx, correlationId, startTime, permissions };
  
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    return toolError("NOT_FOUND", `Unknown command: ${name}. Type /help for available commands.`);
  }
  
  // Permission check
  if (!hasPermission(tool.permission, permissions)) {
    audit({
      timestamp: new Date().toISOString(),
      correlationId,
      tool: name,
      userId: ctx.userId,
      ip: ctx.ip,
      params: args,
      success: false,
      error: "Permission denied",
      duration: Date.now() - startTime,
    });
    return toolError("PERMISSION_DENIED", `Requires ${tool.permission} permission`);
  }
  
  // Per-tool rate limiting
  const limiter = getToolLimiter(tool);
  if (limiter && ctx.ip) {
    const { allowed } = await limiter(`${tool.name}:${ctx.ip}`);
    if (!allowed) {
      return toolError("RATE_LIMITED", `Rate limit exceeded for /${name}. Try again shortly.`);
    }
  }
  
  // Validate args
  const validation = tool.schema.safeParse(args);
  if (!validation.success) {
    const errors = validation.error.issues.map(e => `${e.path.join(".") || "param"}: ${e.message}`).join(", ");
    return toolError("VALIDATION_ERROR", errors);
  }
  
  // Check cache for read operations
  if (tool.cacheTtl && tool.permission === "read") {
    const key = cacheKey(name, args);
    const cached = getCached(key);
    if (cached) {
      return {
        success: true,
        data: cached,
        metadata: { duration: Date.now() - startTime, cacheHit: true }
      };
    }
  }
  
  try {
    const result = await tool.execute(args, fullCtx);
    
    // Cache successful read results
    if (result.success && result.data && tool.cacheTtl && tool.permission === "read") {
      setCache(cacheKey(name, args), result.data, tool.cacheTtl);
      if (result.metadata) result.metadata.cached = true;
    }
    
    // Audit log
    audit({
      timestamp: new Date().toISOString(),
      correlationId,
      tool: name,
      userId: ctx.userId,
      ip: ctx.ip,
      params: args,
      success: result.success,
      error: result.error,
      duration: Date.now() - startTime,
    });
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Command execution failed";
    
    logger.error("Tool execution failed", error instanceof Error ? error : new Error(String(error)), {
      tool: name,
      correlationId,
    });
    
    audit({
      timestamp: new Date().toISOString(),
      correlationId,
      tool: name,
      userId: ctx.userId,
      ip: ctx.ip,
      params: args,
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    });
    
    return toolError("INTERNAL_ERROR", errorMsg);
  }
}

// Health check export
export { toolsHealthCheck };

export type { Tool, ToolResult, ToolContext, ToolDefinition, Permission };
