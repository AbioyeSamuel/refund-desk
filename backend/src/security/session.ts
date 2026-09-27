import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config";

/**
 * Minimal signed customer session (HMAC-SHA256). The refund endpoint derives the
 * customer from this token — never from the request body — so a request can't be
 * filed on someone else's account by editing a field.
 */

const TTL_SECONDS = 60 * 60 * 8;

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", config.SESSION_SECRET).update(payload).digest("base64url");

export function issueSessionToken(customerId: string): string {
  const payload = b64url(JSON.stringify({ sub: customerId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof sub !== "string" || typeof exp !== "number" || exp < Date.now() / 1000) return null;
    return sub;
  } catch {
    return null;
  }
}

/** Constant-time comparison for the admin token. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
