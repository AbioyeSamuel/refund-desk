import { config } from "../config";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { OpenAiProvider } from "./openai";
import { AiProvider } from "./provider";

export function createAiProvider(): AiProvider {
  const { AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, AI_TIMEOUT_MS } = config;

  const anthropic = () => new AnthropicProvider(ANTHROPIC_API_KEY!, config.ANTHROPIC_MODEL, AI_TIMEOUT_MS, config.ANTHROPIC_BASE_URL);
  const openai = () => new OpenAiProvider(OPENAI_API_KEY!, config.OPENAI_MODEL, AI_TIMEOUT_MS, config.OPENAI_BASE_URL);

  switch (AI_PROVIDER) {
    case "anthropic":
      if (!ANTHROPIC_API_KEY) throw new Error("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
      return anthropic();
    case "openai":
      if (!OPENAI_API_KEY) throw new Error("AI_PROVIDER=openai but OPENAI_API_KEY is not set");
      return openai();
    case "mock":
      return new MockProvider();
    default:
      if (ANTHROPIC_API_KEY) return anthropic();
      if (OPENAI_API_KEY) return openai();
      console.warn("[ai] No API key found — running with the offline mock provider.");
      return new MockProvider();
  }
}
