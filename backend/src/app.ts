import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config";
import { errorHandler } from "./middleware";
import { adminRoutes } from "./routes/admin.routes";
import { publicRoutes } from "./routes/public.routes";
import { RefundService } from "./services/refund.service";

export function createApp(service: RefundService) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind nginx in docker-compose
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
  app.use(express.json({ limit: "32kb" }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path !== "/api/health") console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.use("/api", publicRoutes(service));
  app.use("/api/admin", adminRoutes(service));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
  app.use(errorHandler);
  return app;
}
