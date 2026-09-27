import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { config } from "../config";
import { Customer } from "../domain";
import { HttpError } from "../lib/http-error";
import { customersRepo } from "../repositories/crm.repo";
import { safeEqual, verifySessionToken } from "../security/session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: Customer;
    }
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export const requireCustomer = asyncHandler(async (req, _res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const customerId = token ? verifySessionToken(token) : null;
  if (!customerId) throw new HttpError(401, "Please sign in again.");
  const customer = await customersRepo.findById(customerId);
  if (!customer) throw new HttpError(401, "Please sign in again.");
  req.customer = customer;
  next();
});

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = req.header("x-admin-token") ?? "";
  if (!token || !safeEqual(token, config.ADMIN_TOKEN)) return next(new HttpError(401, "Invalid admin token."));
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request.", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if ((err as any)?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request is too large." });
  }
  if ((err as any)?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON." });
  }
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
}
