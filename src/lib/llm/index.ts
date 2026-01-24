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
  const defaultProvider = options?.provider || (process.env.LLM_DEFAULT_PROVIDER as LLMProvider) || (process.env.LLM_PROVIDER as LLMProvider) || "groq";
  const fallbackProvider = process.env.LLM_FALLBACK_PROVIDER as LLMProvider | undefined;

  const callProvider = async (provider: LLMProvider): Promise<string> => {
    if (provider === "ollama") {
      return chatWithOllama(prompt, options);
    }
    return chatWithGroq(prompt, options);
  };

  try {
    return await callProvider(defaultProvider);
  } catch (err) {
    if (fallbackProvider && fallbackProvider !== defaultProvider) {
      console.log(`${defaultProvider} failed, falling back to ${fallbackProvider}`);
      return callProvider(fallbackProvider);
    }
    throw err;
  }
}

export { chatWithGroq, chatWithOllama };
export type { ChatOptions } from "./groq";
