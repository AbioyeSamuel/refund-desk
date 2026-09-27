import { Pool, PoolClient } from "pg";
import { Customer, Order, OrderItem } from "../domain";
import { pool } from "../db/pool";

type Db = Pool | PoolClient;

export const customersRepo = {
  async findByEmail(email: string): Promise<Customer | null> {
    const { rows } = await pool.query<Customer>("SELECT * FROM customers WHERE lower(email) = lower($1)", [email.trim()]);
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<Customer | null> {
    const { rows } = await pool.query<Customer>("SELECT * FROM customers WHERE id = $1", [id]);
    return rows[0] ?? null;
  },

  async list(): Promise<Customer[]> {
    const { rows } = await pool.query<Customer>("SELECT * FROM customers ORDER BY id");
    return rows;
  },
};

async function attachItems(db: Db, orders: Omit<Order, "items">[]): Promise<Order[]> {
  if (!orders.length) return [];
  const { rows } = await db.query<OrderItem>(
    "SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id",
    [orders.map((o) => o.id)],
  );
  return orders.map((o) => ({ ...o, items: rows.filter((i) => i.order_id === o.id) }));
}

export const ordersRepo = {
  async findById(id: string, db: Db = pool): Promise<Order | null> {
    const { rows } = await db.query<Omit<Order, "items">>("SELECT * FROM orders WHERE id = $1", [id.toUpperCase()]);
    if (!rows[0]) return null;
    return (await attachItems(db, rows))[0];
  },

  async listByCustomer(customerId: string): Promise<Order[]> {
    const { rows } = await pool.query<Omit<Order, "items">>(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC",
      [customerId],
    );
    return attachItems(pool, rows);
  },

  async listAll(): Promise<Order[]> {
    const { rows } = await pool.query<Omit<Order, "items">>("SELECT * FROM orders ORDER BY customer_id, placed_at DESC");
    return attachItems(pool, rows);
  },

  /** Marks items refunded only if they aren't already — returns how many rows changed. */
  async markItemsRefunded(db: Db, itemIds: number[]): Promise<number> {
    if (!itemIds.length) return 0;
    const res = await db.query("UPDATE order_items SET refunded = TRUE WHERE id = ANY($1) AND refunded = FALSE", [itemIds]);
    return res.rowCount ?? 0;
  },
};
