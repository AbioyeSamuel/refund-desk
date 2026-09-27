import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { resetDemoData } from "../db/seed";
import { HttpError } from "../lib/http-error";
import { asyncHandler, requireAdmin } from "../middleware";
import { customersRepo, ordersRepo } from "../repositories/crm.repo";
import { refundsRepo } from "../repositories/refunds.repo";
import { RefundService } from "../services/refund.service";

const ListQuery = z.object({
  status: z.enum(["approved", "denied", "escalated", "needs_info", "pending_review"]).optional(),
  search: z.string().trim().max(100).optional(),
  flagged: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ReviewBody = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().trim().min(3, "Add a short note explaining the decision.").max(1000),
  reviewer: z.string().trim().min(2).max(60).default("support-agent"),
});

const IdParam = z.object({ id: z.string().uuid("Invalid request id.") });

export function adminRoutes(service: RefundService): Router {
  const r = Router();
  r.use(requireAdmin);

  r.get("/stats", asyncHandler(async (_req, res) => {
    res.json({ ...(await refundsRepo.stats()), ai: service.providerInfo });
  }));

  r.get("/refund-requests", asyncHandler(async (req, res) => {
    const q = ListQuery.parse(req.query);
    res.json(await refundsRepo.list({ ...q, flagged: q.flagged === "true" }));
  }));

  r.get("/refund-requests/:id", asyncHandler(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const request = await refundsRepo.getById(id);
    if (!request) throw new HttpError(404, "Refund request not found.");
    const orderId = request.order_id ?? request.security_signals?.requested_order_id;
    const order = orderId ? await ordersRepo.findById(orderId) : null;
    const [audit, approvedLast90] = await Promise.all([
      refundsRepo.auditTrail(id),
      refundsRepo.countApprovedSince(request.customer_id, 90),
    ]);
    res.json({
      request,
      // If the order belongs to someone else (R1), show only that fact — not their data.
      order: order && order.customer_id === request.customer_id ? order : null,
      foreign_order: order && order.customer_id !== request.customer_id ? { id: order.id, owner_id: order.customer_id } : null,
      customer_refunds_last_90_days: approvedLast90,
      audit,
    });
  }));

  r.post("/refund-requests/:id/review", asyncHandler(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const body = ReviewBody.parse(req.body);
    res.json(await service.review(id, body.decision, body.note, body.reviewer));
  }));

  r.get("/customers", asyncHandler(async (_req, res) => {
    const [customers, orders] = await Promise.all([customersRepo.list(), ordersRepo.listAll()]);
    res.json(customers.map((c) => ({ ...c, orders: orders.filter((o) => o.customer_id === c.id) })));
  }));

  r.post("/demo/reset", asyncHandler(async (_req, res) => {
    if (!config.DEMO_MODE) throw new HttpError(404, "Not found.");
    await resetDemoData();
    res.json({ ok: true });
  }));

  return r;
}
