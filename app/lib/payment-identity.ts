import { parsePhoneNumberFromString, isSupportedCountry, type CountryCode } from "libphonenumber-js/max";

/** SERVER identity parsing shared by quote, precheck and order creation. */
export function paymentIdentity(phone: unknown, country: unknown) {
  const declaredCountry = typeof country === "string" ? country.trim().toUpperCase() : "";
  const raw = typeof phone === "string" ? phone.trim() : "";
  const fallback = isSupportedCountry(declaredCountry) ? declaredCountry as CountryCode : undefined;
  // Explicit international numbers keep their own country, even when travelling.
  const parsed = parsePhoneNumberFromString(raw.replace(/^00/, "+"), { defaultCountry: fallback, extract: false });
  const usable = parsed?.isPossible() && !parsed.ext;
  return {
    declaredCountry: fallback ?? null,
    phoneKey: usable && parsed ? parsed.number.slice(1) : null,
    phoneCountry: usable && parsed ? parsed.country ?? null : null,
  };
}

/** Trust only the ingress-provided country, never body/query input or selected country.
 * Deployment MUST prevent direct origin access and have Cloudflare overwrite this header.
 */
export function paymentIpCountry(headers: Headers): string | null {
  const country = (headers.get("cf-ipcountry") ?? "").trim().toUpperCase();
  return isSupportedCountry(country) ? country : null;
}
