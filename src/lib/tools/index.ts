import { z } from "zod";
import { Tool, ToolResult, ToolContext, ToolDefinition } from "./types";
import { reviewTools } from "./reviews";
import { securityTools } from "./security";
import { repoTools } from "./repos";
import { analyticsTools } from "./analytics";
import { githubTools } from "./github";
import { logger } from "@/lib/logger";

// Combine all tools
const allTools: Tool[] = [
  ...reviewTools,
  ...securityTools,
  ...repoTools,
  ...analyticsTools,
  ...githubTools,
];

// Help tool (defined here to access allTools)
const helpTool: Tool = {
  name: "help",
  description: "Show all available commands",
  category: "system",
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
        return `  \`/${t.name}${params ? " " + params : ""}\` - ${t.description}`;
      }).join("\n") + "\n\n";
    }
    
    output += `**Tips:**
• Use Tab to autocomplete commands
• Required params in <brackets>, optional in [brackets]
• Type naturally - AI understands context`;
    
    return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime } };
  }
};

// Export all tools including help
export const tools: Tool[] = [...allTools, helpTool];

// Client-side definitions (no execute functions)
export const toolDefinitions: ToolDefinition[] = tools.map(t => ({
  name: t.name,
  description: t.description,
  category: t.category,
  params: t.params.map(p => p.required ? p.name : `${p.name}?`),
  examples: t.name === "trigger-review" ? ["owner/repo 123", "owner/repo 42 deep"] :
            t.name === "reviews" ? ["", "foodshare", "limit=5 status=completed"] :
            t.name === "prs" ? ["owner/repo"] : undefined,
}));

// Execute a tool with validation and logging
export async function executeTool(
  name: string,
  args: Record<string, string>,
  ctx: Partial<ToolContext> = {}
): Promise<ToolResult> {
  const startTime = Date.now();
  const correlationId = ctx.correlationId || crypto.randomUUID();
  const fullCtx: ToolContext = { ...ctx, correlationId, startTime };
  
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    return { success: false, error: `Unknown command: ${name}. Type /help for available commands.` };
  }
  
  // Validate args
  const validation = tool.schema.safeParse(args);
  if (!validation.success) {
    const errors = validation.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
    return { success: false, error: `Invalid parameters: ${errors}` };
  }
  
  try {
    const result = await tool.execute(args, fullCtx);
    
    // Log execution
    logger.info("Tool executed", {
      tool: name,
      correlationId,
      success: result.success,
      duration: Date.now() - startTime,
      recordsAffected: result.metadata?.recordsAffected,
    });
    
    return result;
  } catch (error) {
    logger.error("Tool execution failed", error instanceof Error ? error : new Error(String(error)), {
      tool: name,
      correlationId,
      args,
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Command execution failed",
      metadata: { duration: Date.now() - startTime }
    };
  }
}

export type { Tool, ToolResult, ToolContext, ToolDefinition };
