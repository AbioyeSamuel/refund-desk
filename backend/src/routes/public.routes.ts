import { Router } from "express";
import rateLimit from "express-rate-limit";
import { readFileSync } from "fs";
import path from "path";
import { z } from "zod";
import { config } from "../config";
import { pool } from "../db/pool";
import { Customer, Order } from "../domain";
import { HttpError } from "../lib/http-error";
import { asyncHandler, requireCustomer } from "../middleware";
import { POLICY } from "../policy/policy";
import { customersRepo, ordersRepo } from "../repositories/crm.repo";
import { refundsRepo } from "../repositories/refunds.repo";
import { issueSessionToken } from "../security/session";
import { RefundService } from "../services/refund.service";

const POLICY_MD = readFileSync(path.join(__dirname, "../../policy/refund-policy.md"), "utf8");

// Risk flags and internal notes never leave the server on customer routes.
export const publicCustomer = (c: Customer) => ({ id: c.id, name: c.name, email: c.email, city: c.city, tier: c.tier });
export const publicOrder = (o: Order) => ({
  id: o.id, status: o.status, placed_at: o.placed_at, shipped_at: o.shipped_at, delivered_at: o.delivered_at,
  total: o.total, currency: o.currency,
  items: o.items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, category: i.category, unit_price: i.unit_price, quantity: i.quantity, final_sale: i.final_sale, refunded: i.refunded })),
});

const SessionBody = z.object({ email: z.string().trim().email().max(254) });
const RefundBody = z.object({
  message: z.string().trim().min(1, "Please describe the issue.").max(4000, "Message is too long (max 4000 characters)."),
  orderId: z.string().trim().regex(/^ORD-\d{4,}$/i, "Order numbers look like ORD-1001.").nullish(),
});

export function publicRoutes(service: RefundService): Router {
  const r = Router();

  const sessionLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
  // Keyed by the signed-in customer (not IP) so one noisy account can't lock out an office NAT.
  const refundLimiter = rateLimit({
    windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false,
    keyGenerator: (req) => `customer:${req.customer!.id}`,
    message: { error: "Too many requests. Please wait a minute and try again." },
  });

  r.get("/health", asyncHandler(async (_req, res) => {
    let db = "ok";
    try { await pool.query("SELECT 1"); } catch { db = "down"; }
    res.status(db === "ok" ? 200 : 503).json({ status: db === "ok" ? "ok" : "degraded", db, ai: service.providerInfo, demoMode: config.DEMO_MODE });
  }));

  r.get("/policy", (_req, res) => res.json({ markdown: POLICY_MD, constants: POLICY }));

  r.get("/demo/customers", asyncHandler(async (_req, res) => {
    if (!config.DEMO_MODE) throw new HttpError(404, "Not found.");
    const customers = await customersRepo.list();
    res.json(customers.map((c) => ({ ...publicCustomer(c), scenario: c.demo_scenario })));
  }));

  r.post("/session", sessionLimiter, asyncHandler(async (req, res) => {
    const { email } = SessionBody.parse(req.body);
    const customer = await customersRepo.findByEmail(email);
    // Production would send a magic link / OTP here; the demo signs in by email only.
    if (!customer) throw new HttpError(404, "We couldn't find an account with that email.");
    res.json({ token: issueSessionToken(customer.id), customer: publicCustomer(customer) });
  }));

  r.get("/me", requireCustomer, asyncHandler(async (req, res) => {
    const c = req.customer!;
    const [orders, requests] = await Promise.all([ordersRepo.listByCustomer(c.id), refundsRepo.listForCustomer(c.id)]);
    res.json({ customer: publicCustomer(c), orders: orders.map(publicOrder), requests });
  }));

  r.post("/refund-requests", requireCustomer, refundLimiter, asyncHandler(async (req, res) => {
    const body = RefundBody.parse(req.body);
    const result = await service.handle({ customer: req.customer!, message: body.message, orderId: body.orderId ?? null });
    res.status(result.id ? 201 : 200).json(result);
  }));

  return r;
}
