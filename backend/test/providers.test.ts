import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/ai/anthropic";
import { OpenAiProvider } from "../src/ai/openai";

const input = { message: "headphones arrived cracked", orderId: "ORD-1001", orderStatus: "delivered", items: [{ id: 1, name: "Headphones", unit_price: 129.99, quantity: 1, final_sale: false }] };
const valid = {
  is_refund_request: true, reason_category: "damaged", item_ids: [1], summary: "Headphones arrived cracked.", confidence: 0.93,
  conflicting_claims: false, conflict_notes: null, manipulation_attempt: false, manipulation_notes: null, sentiment: "calm",
};

const mockFetch = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe("AnthropicProvider", () => {
  it("forces the classification tool and parses its input", async () => {
    const spy = mockFetch({ content: [{ type: "tool_use", name: "record_classification", input: valid }] });
    const out = await new AnthropicProvider("k", "claude-test", 1000).classify(input);
    expect(out.reason_category).toBe("damaged");
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.tool_choice).toEqual({ type: "tool", name: "record_classification" });
    expect(sent.messages[0].content).toContain("<customer_message>");
  });

  it("rejects output that doesn't match the schema", async () => {
    mockFetch({ content: [{ type: "tool_use", name: "record_classification", input: { ...valid, reason_category: "approve_now" } }] });
    await expect(new AnthropicProvider("k", "m", 1000).classify(input)).rejects.toThrow();
  });

  it("does not retry client errors", async () => {
    const spy = mockFetch({ error: "bad key" }, 401);
    await expect(new AnthropicProvider("k", "m", 1000).classify(input)).rejects.toThrow(/401/);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAiProvider", () => {
  it("uses strict JSON schema output and parses it", async () => {
    const spy = mockFetch({ choices: [{ message: { content: JSON.stringify(valid) } }] });
    const out = await new OpenAiProvider("k", "gpt-test", 1000).classify(input);
    expect(out.item_ids).toEqual([1]);
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.response_format.json_schema.strict).toBe(true);
  });
});
