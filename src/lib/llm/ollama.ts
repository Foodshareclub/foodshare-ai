export async function chatWithOllama(
  prompt: string,
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const model = options?.model || process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
  const temperature = options?.temperature ?? 0.1;

  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout

  try {
    const response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature, num_ctx: 4096 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}
