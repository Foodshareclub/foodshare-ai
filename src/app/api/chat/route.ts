import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are an AI assistant for FoodShare AI, a code review platform. You help developers with:
- Understanding code review feedback
- Security best practices  
- Performance optimization
- Code quality improvements
- Repository management

Be concise and technical. Use code examples when relevant. Format with markdown.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [] } = body;

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // Get context from recent reviews
    const supabase = await createClient();
    const { data: recentReviews } = await supabase
      .from("reviews")
      .select("repo_full_name, summary, score")
      .order("created_at", { ascending: false })
      .limit(3);

    const context = recentReviews?.length
      ? `\nRecent reviews: ${recentReviews.map(r => `${r.repo_full_name} (${r.score}/100)`).join(", ")}`
      : "";

    // Build conversation history
    const conv = history
      .slice(-6)
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = `${SYSTEM_PROMPT}${context}

${conv ? `Conversation:\n${conv}\n\n` : ""}User: ${message}

Assistant:`;

    const response = await chat(prompt, { temperature: 0.7 });

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
