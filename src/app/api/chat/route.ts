import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";

interface Tool {
  name: string;
  description: string;
  execute: (params: Record<string, string>) => Promise<string>;
}

async function getTools(): Promise<Tool[]> {
  const supabase = await createClient();
  
  return [
    {
      name: "get_reviews",
      description: "Get code reviews. Params: repo (optional), limit (default 10), status (pending/completed/failed)",
      execute: async (params) => {
        let query = supabase.from("reviews").select("id, repo_full_name, pr_number, summary, score, status, created_at").order("created_at", { ascending: false }).limit(parseInt(params.limit || "10"));
        if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
        if (params.status) query = query.eq("status", params.status);
        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        if (!data?.length) return "No reviews found.";
        return data.map(r => `• ${r.repo_full_name} PR#${r.pr_number}: ${r.score}/100 - ${r.summary?.slice(0, 100) || 'No summary'}... (${r.status})`).join("\n");
      }
    },
    {
      name: "get_scans",
      description: "Get security scans. Params: repo (optional), limit (default 10)",
      execute: async (params) => {
        let query = supabase.from("security_scans").select("id, repo_full_name, score, grade, critical_count, high_count, created_at").order("created_at", { ascending: false }).limit(parseInt(params.limit || "10"));
        if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        if (!data?.length) return "No scans found.";
        return data.map(s => `• ${s.repo_full_name}: Grade ${s.grade} (${s.score}/100) - ${s.critical_count} critical, ${s.high_count} high issues`).join("\n");
      }
    },
    {
      name: "get_repos",
      description: "Get configured repositories",
      execute: async () => {
        const { data, error } = await supabase.from("repo_configs").select("repo_full_name, enabled, review_depth, auto_review, last_reviewed_at").order("repo_full_name");
        if (error) return `Error: ${error.message}`;
        if (!data?.length) return "No repos configured.";
        return data.map(r => `• ${r.repo_full_name}: ${r.enabled ? '✓ enabled' : '✗ disabled'}, depth: ${r.review_depth}, auto: ${r.auto_review}`).join("\n");
      }
    },
    {
      name: "get_stats",
      description: "Get overall platform statistics",
      execute: async () => {
        const [reviews, scans, repos, queue] = await Promise.all([
          supabase.from("reviews").select("id", { count: "exact", head: true }),
          supabase.from("security_scans").select("id", { count: "exact", head: true }),
          supabase.from("repo_configs").select("id", { count: "exact", head: true }),
          supabase.from("review_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);
        return `Platform Stats:\n• Total reviews: ${reviews.count || 0}\n• Total scans: ${scans.count || 0}\n• Configured repos: ${repos.count || 0}\n• Pending in queue: ${queue.count || 0}`;
      }
    },
    {
      name: "trigger_scan",
      description: "Trigger a security scan. Params: repo (required, e.g. 'owner/repo')",
      execute: async (params) => {
        if (!params.repo) return "Error: repo required (format: owner/repo)";
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const cronSecret = process.env.CRON_SECRET;
        if (!supabaseUrl || !cronSecret) return "Error: scan service not configured";
        try {
          await fetch(`${supabaseUrl}/functions/v1/scan-repos?repo=${encodeURIComponent(params.repo)}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
          return `✓ Security scan triggered for ${params.repo}. Results will be available shortly.`;
        } catch (e) {
          return `Error triggering scan: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
      }
    },
    {
      name: "trigger_review",
      description: "Trigger a code review for a PR. Params: repo (required), pr (required PR number), depth (quick/standard/deep)",
      execute: async (params) => {
        if (!params.repo || !params.pr) return "Error: repo and pr required";
        const [owner, repo] = params.repo.split("/");
        if (!owner || !repo) return "Error: repo format should be owner/repo";
        const { data, error } = await supabase.from("review_queue").insert({
          repo_full_name: params.repo,
          pr_number: parseInt(params.pr),
          status: "pending",
          depth: params.depth || "standard",
        }).select().single();
        if (error) return `Error: ${error.message}`;
        return `✓ Review queued for ${params.repo} PR#${params.pr} (${params.depth || 'standard'} depth). Job ID: ${data.id}`;
      }
    },
    {
      name: "get_queue",
      description: "Get current job queue status",
      execute: async () => {
        const { data, error } = await supabase.from("review_queue").select("id, repo_full_name, pr_number, status, attempts, created_at").order("created_at", { ascending: false }).limit(10);
        if (error) return `Error: ${error.message}`;
        if (!data?.length) return "Queue is empty.";
        const pending = data.filter(j => j.status === "pending").length;
        const processing = data.filter(j => j.status === "processing").length;
        return `Queue: ${pending} pending, ${processing} processing\n\nRecent jobs:\n${data.map(j => `• ${j.repo_full_name} PR#${j.pr_number}: ${j.status} (attempts: ${j.attempts})`).join("\n")}`;
      }
    },
  ];
}

function parseToolCall(response: string): { tool: string; params: Record<string, string> } | null {
  const match = response.match(/\[TOOL:(\w+)(?:\s+(.+?))?\]/);
  if (!match) return null;
  const params: Record<string, string> = {};
  if (match[2]) {
    const paramMatches = match[2].matchAll(/(\w+)="([^"]+)"/g);
    for (const m of paramMatches) {
      if (m[1] && m[2]) params[m[1]] = m[2];
    }
  }
  return { tool: match[1] || "", params };
}

const SYSTEM_PROMPT = `You are an AI assistant for FoodShare AI, a code review platform. You have access to tools to query and manage the platform.

## Available Tools
Call tools using: [TOOL:tool_name param1="value1" param2="value2"]

- get_reviews: Get code reviews (params: repo, limit, status)
- get_scans: Get security scans (params: repo, limit)  
- get_repos: List configured repositories
- get_stats: Get platform statistics
- get_queue: Get job queue status
- trigger_scan: Start security scan (params: repo)
- trigger_review: Queue PR review (params: repo, pr, depth)

## Guidelines
- ALWAYS use tools to fetch real data before answering questions about reviews, scans, or repos
- When asked to scan or review, use trigger_scan or trigger_review
- Be concise and technical
- Format data clearly
- Only call ONE tool per response

## Examples
User: "Show me recent reviews"
Assistant: [TOOL:get_reviews limit="5"]

User: "Run a security scan on Foodshareclub/foodshare-ios"  
Assistant: [TOOL:trigger_scan repo="Foodshareclub/foodshare-ios"]

User: "What repos do I have?"
Assistant: [TOOL:get_repos]`;

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();
    if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });

    const tools = await getTools();
    
    const conv = history.slice(-8).map((m: { role: string; content: string }) => 
      `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
    ).join("\n");

    const prompt = `${SYSTEM_PROMPT}\n\n${conv ? `Conversation:\n${conv}\n\n` : ""}User: ${message}\nAssistant:`;

    let response = await chat(prompt, { temperature: 0.3 });
    
    // Check for tool call
    const toolCall = parseToolCall(response);
    if (toolCall) {
      const tool = tools.find(t => t.name === toolCall.tool);
      if (tool) {
        const toolResult = await tool.execute(toolCall.params);
        
        // Second LLM call with tool result
        const followUp = `${prompt} ${response}\n\nTool Result:\n${toolResult}\n\nNow provide a helpful response based on this data:`;
        response = await chat(followUp, { temperature: 0.5 });
      }
    }

    // Clean up any remaining tool syntax
    response = response.replace(/\[TOOL:[^\]]+\]/g, "").trim();

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
