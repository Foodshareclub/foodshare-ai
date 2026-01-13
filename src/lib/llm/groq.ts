import Groq from "groq-sdk";

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("rate_limit") ||
      error.message.includes("Rate limit") ||
      error.message.includes("429") ||
      (error as { status?: number }).status === 429
    );
  }
  return false;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  useReviewModel?: boolean;
  maxRetries?: number;
}

export async function chatWithGroq(
  prompt: string,
  options?: ChatOptions
): Promise<string> {
  const groq = getGroqClient();
  const maxRetries = options?.maxRetries ?? 3;

  // Use review model if specified, otherwise use default model
  let model: string;
  if (options?.useReviewModel) {
    model = process.env.GROQ_REVIEW_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  } else {
    model = options?.model || process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  }

  const temperature = options?.temperature ?? 0.1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      if (isRateLimitError(error) && attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Max retries exceeded");
}
