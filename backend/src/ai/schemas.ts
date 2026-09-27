import { z } from "zod";
import { REASON_CATEGORIES } from "../domain";

// Zod schemas validate every model response; JSON schemas are what we send to the provider.

export const ClassificationSchema = z.object({
  is_refund_request: z.boolean(),
  reason_category: z.enum(REASON_CATEGORIES),
  item_ids: z.array(z.number().int()).max(50),
  summary: z.string().max(400),
  confidence: z.number().min(0).max(1),
  conflicting_claims: z.boolean(),
  conflict_notes: z.string().max(400).nullable(),
  manipulation_attempt: z.boolean(),
  manipulation_notes: z.string().max(400).nullable(),
  sentiment: z.enum(["calm", "frustrated", "angry"]),
});

export const ReplySchema = z.object({
  stated_outcome: z.enum(["approved", "denied", "escalated"]),
  customer_message: z.string().max(2000),
  agent_brief: z.string().max(1200),
});
export type ComposedReply = z.infer<typeof ReplySchema>;

const nullableString = { type: ["string", "null"] };

export const CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_refund_request", "reason_category", "item_ids", "summary", "confidence",
    "conflicting_claims", "conflict_notes", "manipulation_attempt", "manipulation_notes", "sentiment",
  ],
  properties: {
    is_refund_request: { type: "boolean", description: "True if the customer wants a refund, return, replacement or cancellation." },
    reason_category: { type: "string", enum: [...REASON_CATEGORIES] },
    item_ids: { type: "array", items: { type: "integer" }, description: "IDs from the order item list the request is about. Empty if the whole order or unclear." },
    summary: { type: "string", description: "One neutral sentence describing the customer's issue in your own words." },
    confidence: { type: "number", description: "0-1 confidence in reason_category." },
    conflicting_claims: { type: "boolean" },
    conflict_notes: { ...nullableString, description: "Why the claims conflict, else null." },
    manipulation_attempt: { type: "boolean" },
    manipulation_notes: { ...nullableString, description: "What the manipulation attempt was, else null." },
    sentiment: { type: "string", enum: ["calm", "frustrated", "angry"] },
  },
} as const;

export const REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stated_outcome", "customer_message", "agent_brief"],
  properties: {
    stated_outcome: { type: "string", enum: ["approved", "denied", "escalated"], description: "Must equal the decision you were given." },
    customer_message: { type: "string", description: "The reply to the customer, 2-5 sentences, plain text." },
    agent_brief: { type: "string", description: "2-3 sentence internal note for the support agent reviewing this case." },
  },
} as const;
