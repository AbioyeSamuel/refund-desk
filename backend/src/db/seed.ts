import { PoolClient } from "pg";
import { pool, withTransaction } from "./pool";
import { SCHEMA_SQL } from "./schema";
import { SEED_CUSTOMERS } from "./seed-data";
import { newReference } from "../lib/ids";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (now: number, d?: number) => (d === undefined ? null : new Date(now - d * DAY_MS));

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

async function insertSeed(client: PoolClient): Promise<void> {
  const now = Date.now();

  for (const c of SEED_CUSTOMERS) {
    await client.query(
      `INSERT INTO customers (id, name, email, phone, city, tier, risk_flag, risk_note, demo_scenario, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [c.id, c.name, c.email, c.phone, c.city, c.tier, c.riskFlag ?? false, c.riskNote ?? null, c.scenario, daysAgo(now, 400)],
    );

    const refundedItemsByOrder = new Map<string, { id: number; price: number }[]>();

    for (const o of c.orders) {
      const total = o.items.reduce((sum, i) => sum + i.unitPrice * (i.quantity ?? 1), 0);
      await client.query(
        `INSERT INTO orders (id, customer_id, status, placed_at, shipped_at, delivered_at, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [o.id, c.id, o.status, daysAgo(now, o.placedDaysAgo), daysAgo(now, o.shippedDaysAgo), daysAgo(now, o.deliveredDaysAgo), total.toFixed(2)],
      );
      for (const i of o.items) {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO order_items (order_id, sku, name, category, unit_price, quantity, final_sale, refunded)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [o.id, i.sku, i.name, i.category, i.unitPrice, i.quantity ?? 1, i.finalSale ?? false, i.refunded ?? false],
        );
        if (i.refunded) {
          const list = refundedItemsByOrder.get(o.id) ?? [];
          list.push({ id: rows[0].id, price: i.unitPrice * (i.quantity ?? 1) });
          refundedItemsByOrder.set(o.id, list);
        }
      }
    }

    // Historical refunds: each one consumes the next refunded item on that order.
    for (const h of c.history ?? []) {
      const item = refundedItemsByOrder.get(h.orderId)?.shift();
      const createdAt = daysAgo(now, h.daysAgo);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO refund_requests
           (reference, customer_id, order_id, channel, message, status, reason_category, amount, item_ids,
            primary_rule, customer_response, ai_summary, rule_trace, ai_provider, created_at)
         VALUES ($1,$2,$3,'historical',$4,'approved',$5,$6,$7,'R7',$8,$9,'[]','legacy-import',$10)
         RETURNING id`,
        [
          newReference(), c.id, h.orderId, h.message, h.reason, item?.price ?? 0, item ? [item.id] : [],
          "Refund approved.", "Imported from legacy helpdesk.", createdAt,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (refund_request_id, event_type, actor, detail, created_at)
         VALUES ($1,'imported','system',$2,$3)`,
        [rows[0].id, JSON.stringify({ source: "legacy helpdesk" }), createdAt],
      );
    }
  }
}

export async function seedIfEmpty(): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM customers");
  if (Number(rows[0].n) > 0) return false;
  await withTransaction(insertSeed);
  return true;
}

export async function resetDemoData(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("TRUNCATE audit_events, refund_requests, order_items, orders, customers RESTART IDENTITY CASCADE");
    await insertSeed(client);
  });
}
