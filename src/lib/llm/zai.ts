import { llmCircuitBreaker } from "../circuit-breaker";
import { metrics } from "../metrics";
import type { ChatOptions } from "./groq";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimitError(error: unknown): { isRateLimit: boolean; retryAfter?: number } {
  if (!(error instanceof Error)) return { isRateLimit: false };
  const msg = error.message.toLowerCase();
  const status = (error as { status?: number }).status;
  const isRateLimit = status === 429 || msg.includes("rate_limit") || msg.includes("rate limit");
  const retryMatch = msg.match(/retry.?after[:\s]+(\d+)/i);
  return { isRateLimit, retryAfter: retryMatch ? parseInt(retryMatch[1]!, 10) * 1000 : undefined };
}

export async function chatWithZai(
  prompt: string,
  options?: ChatOptions
): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) throw new Error("ZAI_API_KEY environment variable is required");

  const host = process.env.ZAI_API_HOST || "https://api.z.ai";
  const model = options?.model || process.env.ZAI_MODEL || "glm-4.7-flash";
  const maxRetries = options?.maxRetries ?? 3;

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const start = Date.now();
  return llmCircuitBreaker.execute(async () => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${host}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: options?.temperature ?? 0.1,
            ...(options?.maxTokens && { max_tokens: options.maxTokens }),
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          const error = new Error(`Z.AI API error: ${response.status} ${text}`) as Error & { status: number };
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        metrics.timing("llm_latency", start, { model });
        metrics.increment("llm_requests", 1, { model, status: "success" });
        return data.choices?.[0]?.message?.content || "";
      } catch (error) {
        const { isRateLimit, retryAfter } = isRateLimitError(error);
        if (isRateLimit && attempt < maxRetries - 1) {
          const delay = retryAfter || Math.min(1000 * Math.pow(2, attempt + 1), 30000);
          metrics.increment("llm_rate_limits", 1, { model });
          await sleep(delay);
          continue;
        }
        metrics.increment("llm_requests", 1, { model, status: "error" });
        throw error;
      }
    }
    throw new Error("Z.AI max retries exceeded");
  });
}
