import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === undefined || ["1", "true", "yes"].includes(v.toLowerCase()));

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("postgres://refunddesk:refunddesk@localhost:5432/refunddesk"),
  CORS_ORIGIN: z.string().default("http://localhost:3000,http://localhost:5173"),

  // "auto" picks anthropic -> openai -> mock depending on which key is present.
  AI_PROVIDER: z.enum(["auto", "anthropic", "openai", "mock"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // Any OpenAI-compatible endpoint works here (Azure OpenAI proxy, Groq, a local Ollama, ...).
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),

  ADMIN_TOKEN: z.string().min(8).default("change-me-admin-token"),
  SESSION_SECRET: z.string().min(16).default("dev-only-session-secret-change-me"),
  DEMO_MODE: bool,
});

const parsed = EnvSchema.safeParse(
  Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v])),
);

if (!parsed.success) {
  // Fail fast with a readable message instead of a stack trace deep inside the app.
  console.error("Invalid environment configuration:", parsed.error.issues);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
