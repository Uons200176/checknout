/**
 * The caller's real IP address.
 *
 * Read ONLY from headers a proxy sets, never the client-controllable left-most
 * X-Forwarded-For hop — a bot can put anything it likes there. Order:
 *   1. cf-connecting-ip — Cloudflare OVERWRITES this, so a visitor cannot forge it
 *   2. x-real-ip        — set by our own reverse proxy
 *   3. the LAST XFF hop — the one our proxy appended, not the one the client sent
 *
 * All three are only trustworthy because traffic reaches the app through
 * Cloudflare and the VPS proxy. A request that bypasses both — by connecting to
 * the origin IP directly — can forge every one of them, which is why the origin
 * must be firewalled to Cloudflare's ranges at deploy time.
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
