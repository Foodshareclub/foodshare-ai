import { chatWithGroq, ChatOptions } from "./groq";
import { chatWithOllama } from "./ollama";

export type LLMProvider = "groq" | "ollama";

export interface LLMChatOptions extends ChatOptions {
  provider?: LLMProvider;
}

export async function chat(
  prompt: string,
  options?: LLMChatOptions
): Promise<string> {
  const provider = options?.provider || (process.env.LLM_PROVIDER as LLMProvider) || "groq";

  if (provider === "ollama") {
    return chatWithOllama(prompt, options);
  }

  return chatWithGroq(prompt, options);
}

export { chatWithGroq, chatWithOllama };
export type { ChatOptions } from "./groq";
