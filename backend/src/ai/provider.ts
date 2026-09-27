import { AiClassification } from "../domain";
import { ClassifyInput, ComposeInput } from "./prompts";
import { ComposedReply } from "./schemas";

export interface AiProvider {
  readonly name: "anthropic" | "openai" | "mock";
  readonly model: string;
  classify(input: ClassifyInput): Promise<AiClassification>;
  compose(input: ComposeInput): Promise<ComposedReply>;
}

export class AiProviderError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** fetch with timeout and a single retry on transient failures (429 / 5xx / network). */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new AiProviderError(`HTTP ${res.status}: ${text}`, retryable);
      if (!retryable) break;
    } catch (err) {
      lastError = err instanceof AiProviderError ? err : new AiProviderError(`Network error: ${(err as Error).message}`, true);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw lastError;
}
