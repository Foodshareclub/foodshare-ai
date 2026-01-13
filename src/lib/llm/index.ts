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
  const provider = options?.provider || (process.env.LLM_PROVIDER as LLMProvider) || "ollama";

  // Try Ollama first, fall back to Groq
  if (provider === "ollama") {
    try {
      return await chatWithOllama(prompt, options);
    } catch (err) {
      console.log("Ollama failed, falling back to Groq:", err);
      if (process.env.GROQ_API_KEY) {
        return chatWithGroq(prompt, options);
      }
      throw err;
    }
  }

  return chatWithGroq(prompt, options);
}

export { chatWithGroq, chatWithOllama };
export type { ChatOptions } from "./groq";
