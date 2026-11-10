import { checkoutRpc } from "./checkout-rpc";
import { ensureCheckoutPrecheck } from "./checkout-precheck";
import { getClientIp } from "./client-ip";
import { paymentIdentity, paymentIpCountry } from "./payment-identity";

/** One server decision for visibility AND order submission; no browser verdict is trusted. */
export async function paymentEligibility(args: {
  site: string; methods: string[]; phone: unknown; country: unknown; email: unknown; headers: Headers;
}) {
  const identity = paymentIdentity(args.phone, args.country);
  const ipCountry = paymentIpCountry(args.headers);
  await ensureCheckoutPrecheck(args.site, identity.phoneKey, getClientIp(args.headers));
  const { data, error } = await checkoutRpc("payment_eligibility_v3", {
    p_site: args.site, p_methods: args.methods, p_phone: identity.phoneKey,
    p_phone_country: identity.phoneCountry, p_email: typeof args.email === "string" ? args.email.trim().toLowerCase() : null,
    p_declared_country: identity.declaredCountry, p_ip_country: ipCountry,
  });
  return { verdicts: error ? null : data as Record<string, boolean> | null, error, identity, ipCountry };
}
