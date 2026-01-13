export async function chatWithOllama(
  prompt: string,
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const model = options?.model || process.env.OLLAMA_MODEL || "llama3.2:3b";
  const temperature = options?.temperature ?? 0.1;

  const response = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || "";
}
