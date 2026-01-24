import Groq from "groq-sdk";
import { llmCircuitBreaker } from "../circuit-breaker";
import { metrics } from "../metrics";

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY environment variable is required");
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimitError(error: unknown): { isRateLimit: boolean; retryAfter?: number } {
  if (!(error instanceof Error)) return { isRateLimit: false };
  const msg = error.message.toLowerCase();
  const status = (error as { status?: number }).status;
  const isRateLimit = status === 429 || msg.includes("rate_limit") || msg.includes("rate limit");
  const retryMatch = msg.match(/retry.?after[:\s]+(\d+)/i);
  return { isRateLimit, retryAfter: retryMatch ? parseInt(retryMatch[1]!, 10) * 1000 : undefined };
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  useReviewModel?: boolean;
  maxRetries?: number;
  systemPrompt?: string;
  maxTokens?: number;
}

export async function chatWithGroq(prompt: string, options?: ChatOptions): Promise<string> {
  const groq = getGroqClient();
  const maxRetries = options?.maxRetries ?? 4;
  const model = options?.useReviewModel
    ? process.env.GROQ_REVIEW_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant"
    : options?.model || process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const start = Date.now();
  return llmCircuitBreaker.execute(async () => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const messages: { role: "system" | "user"; content: string }[] = [];
        if (options?.systemPrompt) {
          messages.push({ role: "system", content: options.systemPrompt });
        }
        messages.push({ role: "user", content: prompt });

        const response = await groq.chat.completions.create({
          model,
          messages,
          temperature: options?.temperature ?? 0.1,
          ...(options?.maxTokens && { max_tokens: options.maxTokens }),
        });
        metrics.timing("llm_latency", start, { model });
        metrics.increment("llm_requests", 1, { model, status: "success" });
        return response.choices[0]?.message?.content || "";
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
    throw new Error("Max retries exceeded");
  });
}
