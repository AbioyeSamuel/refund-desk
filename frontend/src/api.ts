import type {
  CrmCustomer, Customer, CustomerRequest, DemoCustomer, Health, Order, RefundDetail, RefundResult, RefundRow, Stats,
} from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string; admin?: string } = {}): Promise<T> {
  const { token, admin, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(admin ? { "x-admin-token": admin } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is the backend running?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.details?.[0]?.message;
    throw new ApiError(res.status, detail ?? body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  health: () => request<Health>("/health"),
  policy: () => request<{ markdown: string; constants: Record<string, string | number> }>("/policy"),
  demoCustomers: () => request<DemoCustomer[]>("/demo/customers"),

  signIn: (email: string) =>
    request<{ token: string; customer: Customer }>("/session", { method: "POST", body: JSON.stringify({ email }) }),
  me: (token: string) => request<{ customer: Customer; orders: Order[]; requests: CustomerRequest[] }>("/me", { token }),
  submitRefund: (token: string, message: string, orderId: string | null) =>
    request<RefundResult>("/refund-requests", { method: "POST", token, body: JSON.stringify({ message, orderId }) }),

  admin: {
    stats: (admin: string) => request<Stats>("/admin/stats", { admin }),
    list: (admin: string, params: Record<string, string>) =>
      request<{ total: number; items: RefundRow[] }>(`/admin/refund-requests?${new URLSearchParams(params)}`, { admin }),
    detail: (admin: string, id: string) => request<RefundDetail>(`/admin/refund-requests/${id}`, { admin }),
    review: (admin: string, id: string, decision: "approved" | "denied", note: string, reviewer: string) =>
      request(`/admin/refund-requests/${id}/review`, { method: "POST", admin, body: JSON.stringify({ decision, note, reviewer }) }),
    customers: (admin: string) => request<CrmCustomer[]>("/admin/customers", { admin }),
    reset: (admin: string) => request<{ ok: boolean }>("/admin/demo/reset", { method: "POST", admin }),
  },
};
