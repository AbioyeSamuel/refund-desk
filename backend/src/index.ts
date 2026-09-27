import { createAiProvider } from "./ai";
import { createApp } from "./app";
import { config } from "./config";
import { pool, waitForDatabase } from "./db/pool";
import { migrate, seedIfEmpty } from "./db/seed";
import { RefundService } from "./services/refund.service";

async function main() {
  await waitForDatabase();
  await migrate();
  if (await seedIfEmpty()) console.log("[db] seeded 15 demo customers");

  const ai = createAiProvider();
  const app = createApp(new RefundService(ai));
  const server = app.listen(config.PORT, () => {
    console.log(`[api] listening on :${config.PORT} · AI provider: ${ai.name} (${ai.model}) · demo mode: ${config.DEMO_MODE}`);
  });

  const shutdown = () => {
    console.log("[api] shutting down");
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
