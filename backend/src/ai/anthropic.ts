import { AiClassification } from "../domain";
import { AiProvider, AiProviderError, postJson } from "./provider";
import { CLASSIFY_SYSTEM, COMPOSE_SYSTEM, ClassifyInput, ComposeInput, classifyUserPrompt, composeUserPrompt } from "./prompts";
import { CLASSIFICATION_JSON_SCHEMA, ClassificationSchema, ComposedReply, REPLY_JSON_SCHEMA, ReplySchema } from "./schemas";

/**
 * Anthropic Messages API with forced tool use, so the model must answer with
 * JSON matching our schema (no free-text parsing).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;

  constructor(
    private apiKey: string,
    readonly model: string,
    private timeoutMs: number,
    private baseUrl = "https://api.anthropic.com",
  ) {}

  private async callTool(system: string, user: string, toolName: string, schema: object, maxTokens: number): Promise<unknown> {
    const data = await postJson(
      `${this.baseUrl.replace(/\/$/, "")}/v1/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        tools: [{ name: toolName, description: `Return the ${toolName} result.`, input_schema: schema }],
        tool_choice: { type: "tool", name: toolName },
        messages: [{ role: "user", content: user }],
      },
      this.timeoutMs,
    );
    const block = data?.content?.find((c: any) => c.type === "tool_use" && c.name === toolName);
    if (!block) throw new AiProviderError("Model did not return a tool call");
    return block.input;
  }

  async classify(input: ClassifyInput): Promise<AiClassification> {
    const raw = await this.callTool(CLASSIFY_SYSTEM, classifyUserPrompt(input), "record_classification", CLASSIFICATION_JSON_SCHEMA, 600);
    return ClassificationSchema.parse(raw);
  }

  async compose(input: ComposeInput): Promise<ComposedReply> {
    const raw = await this.callTool(COMPOSE_SYSTEM, composeUserPrompt(input), "write_reply", REPLY_JSON_SCHEMA, 700);
    return ReplySchema.parse(raw);
  }
}
