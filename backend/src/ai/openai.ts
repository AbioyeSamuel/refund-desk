import { AiClassification } from "../domain";
import { AiProvider, AiProviderError, postJson } from "./provider";
import { CLASSIFY_SYSTEM, COMPOSE_SYSTEM, ClassifyInput, ComposeInput, classifyUserPrompt, composeUserPrompt } from "./prompts";
import { CLASSIFICATION_JSON_SCHEMA, ClassificationSchema, ComposedReply, REPLY_JSON_SCHEMA, ReplySchema } from "./schemas";

/** OpenAI Chat Completions with strict JSON-schema structured outputs. */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;

  constructor(
    private apiKey: string,
    readonly model: string,
    private timeoutMs: number,
    private baseUrl = "https://api.openai.com/v1",
  ) {}

  private async callJson(system: string, user: string, name: string, schema: object): Promise<unknown> {
    const data = await postJson(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      },
      this.timeoutMs,
    );
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new AiProviderError("Empty model response");
    try {
      return JSON.parse(content);
    } catch {
      throw new AiProviderError("Model returned invalid JSON");
    }
  }

  async classify(input: ClassifyInput): Promise<AiClassification> {
    return ClassificationSchema.parse(await this.callJson(CLASSIFY_SYSTEM, classifyUserPrompt(input), "classification", CLASSIFICATION_JSON_SCHEMA));
  }

  async compose(input: ComposeInput): Promise<ComposedReply> {
    return ReplySchema.parse(await this.callJson(COMPOSE_SYSTEM, composeUserPrompt(input), "reply", REPLY_JSON_SCHEMA));
  }
}
