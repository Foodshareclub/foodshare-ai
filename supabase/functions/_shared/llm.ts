import Groq from "https://esm.sh/groq-sdk@0.37.0";

export type LLMProvider = "groq" | "ollama";

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  provider?: LLMProvider;
  useReviewModel?: boolean;
  maxRetries?: number;
  timeout?: number;
}

const env = (key: string) => Deno.env.get(key) || "";

let _groqClient: Groq | null = null;

function getGroqClient(): Groq {
  const apiKey = env("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY required");
  if (!_groqClient) _groqClient = new Groq({ apiKey });
  return _groqClient;
}

function parseRateLimit(error: unknown): { isRateLimit: boolean; retryAfter?: number } {
  if (!(error instanceof Error)) return { isRateLimit: false };
  const msg = error.message.toLowerCase();
  const status = (error as { status?: number }).status;
  const isRateLimit = status === 429 || msg.includes("rate_limit") || msg.includes("rate limit");
  const match = msg.match(/retry.?after[:\s]+(\d+)/i);
  return { isRateLimit, retryAfter: match ? parseInt(match[1], 10) * 1000 : undefined };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chatWithGroq(prompt: string, options?: ChatOptions): Promise<string> {
  const groq = getGroqClient();
  const maxRetries = options?.maxRetries ?? 3;
  const model = options?.useReviewModel
    ? env("GROQ_REVIEW_MODEL") || env("GROQ_MODEL") || "llama-3.3-70b-versatile"
    : options?.model || env("GROQ_MODEL") || "llama-3.1-8b-instant";

  const messages: { role: string; content: string }[] = [];
  if (options?.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: prompt });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 4096,
      });
      return response.choices[0]?.message?.content || "";
    } catch (e) {
      const { isRateLimit, retryAfter } = parseRateLimit(e);
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = retryAfter || Math.min(2000 * Math.pow(2, attempt), 30000);
        console.log(`Groq rate limit, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Groq max retries exceeded");
}

async function chatWithOllama(prompt: string, options?: ChatOptions): Promise<string> {
  const host = env("OLLAMA_HOST_EXTERNAL") || env("OLLAMA_HOST") || "http://localhost:11434";
  const model = options?.model || env("OLLAMA_MODEL") || "qwen2.5-coder:7b";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  
  // Authentication options
  const apiKey = env("OLLAMA_API_KEY");
  const bearerToken = env("OLLAMA_BEARER_TOKEN");
  const basicUser = env("OLLAMA_BASIC_AUTH_USER");
  const basicPass = env("OLLAMA_BASIC_AUTH_PASS");
  
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  else if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
  else if (basicUser && basicPass) {
    headers["Authorization"] = `Basic ${btoa(`${basicUser}:${basicPass}`)}`;
  }

  // Cloudflare Access
  const cfId = env("CF_ACCESS_CLIENT_ID"), cfSecret = env("CF_ACCESS_CLIENT_SECRET");
  if (cfId && cfSecret) {
    headers["CF-Access-Client-Id"] = cfId;
    headers["CF-Access-Client-Secret"] = cfSecret;
  }

  const messages: { role: string; content: string }[] = [];
  if (options?.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeout ?? 120000);

  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: options?.temperature ?? 0.1, num_ctx: 8192 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    return (await res.json()).message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function chat(prompt: string, options?: ChatOptions): Promise<string> {
  const provider = options?.provider || (env("LLM_PROVIDER") as LLMProvider) || "groq";

  if (provider === "ollama") {
    try {
      return await chatWithOllama(prompt, options);
    } catch (e) {
      if (env("GROQ_API_KEY")) {
        console.log(`Ollama failed (${e instanceof Error ? e.message : e}), falling back to Groq`);
        return chatWithGroq(prompt, options);
      }
      throw e;
    }
  }

  return chatWithGroq(prompt, options);
}

export function getLLMStatus() {
  const provider = (env("LLM_PROVIDER") as LLMProvider) || "groq";
  return {
    provider,
    ready: provider === "groq" ? !!env("GROQ_API_KEY") : !!env("OLLAMA_HOST"),
    fallback: provider === "ollama" && !!env("GROQ_API_KEY"),
  };
}
