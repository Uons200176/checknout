/**
 * Validation of everything the customer types, enforced ON THE SERVER.
 *
 * The checkout form already checks most of this, but a form is not a control —
 * anyone can POST straight to a create route and skip it entirely. Until now
 * those routes only checked that the fields were PRESENT, so a direct caller
 * could store a megabyte-long name, or a value that is not an email at all.
 * This file is the enforcement; the form is the courtesy version of it.
 *
 * One home for the rules: the client mirrors these limits to phrase its error
 * messages, but this is what actually decides.
 */

import { countries } from "@/app/data/countries";

/** Every bound in one place — change a number here and both sides follow. */
export const LIMITS = {
  /** Name must EXCEED this, so three-character input is refused. */
  nameMin: 3,
  nameMax: 20,
  /** Short by RFC standards (254); chosen to keep the field un-abusable. */
  emailMax: 40,
  phoneDigitsMin: 6,
  phoneDigitsMax: 15,
  countryMax: 4,
  deviceMax: 40,
  /** Whole-request ceiling, so an oversized body is refused before parsing. */
  bodyMaxBytes: 8 * 1024,
} as const;

/**
 * Same shape the form uses. Deliberately loose about what may appear before the
 * at-sign: real addresses contain plus signs, apostrophes and unicode, and a
 * stricter pattern turns away paying customers to catch nothing.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Control characters and zero-width marks, written as escape sequences so that
 * no literal control byte ever sits in this source file.
 */
const INVISIBLE_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g;

/**
 * Collapse whitespace and drop invisible characters.
 *
 * NOT a character whitelist. Names carry accents, Arabic, apostrophes and
 * hyphens, and any "letters only" rule turns real customers away — which costs
 * more than the abuse it prevents. Length is the limit that matters; this only
 * stops newlines and zero-width marks being smuggled into stored text.
 */
function clean(value: unknown): string {
  return String(value ?? "").replace(INVISIBLE_RE, " ").replace(/\s+/g, " ").trim();
}

export interface CleanCustomer {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerCountry: string | null;
  deviceType: string | null;
}

export type CustomerResult =
  | { ok: true; value: CleanCustomer }
  | { ok: false; error: string };

/**
 * Validate and normalise the customer fields of a create request. Messages are
 * the ones the customer sees, so they say what to fix.
 */
export function validateCustomer(body: Record<string, unknown>): CustomerResult {
  const customerName = clean(body.customerName);
  if (customerName.length <= LIMITS.nameMin) {
    return { ok: false, error: "Please enter your full name." };
  }
  if (customerName.length > LIMITS.nameMax) {
    return { ok: false, error: "Name must be " + LIMITS.nameMax + " characters or fewer." };
  }

  const customerEmail = clean(body.customerEmail).toLowerCase();
  if (customerEmail.length > LIMITS.emailMax) {
    return { ok: false, error: "Email must be " + LIMITS.emailMax + " characters or fewer." };
  }
  if (!EMAIL_RE.test(customerEmail)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const phoneRaw = clean(body.customerPhone);
  const digits = phoneRaw.replace(/\D/g, "");
  if (phoneRaw && (digits.length < LIMITS.phoneDigitsMin || digits.length > LIMITS.phoneDigitsMax)) {
    return { ok: false, error: "Please enter a valid phone number." };
  }

  const customerCountry = clean(body.customerCountry).slice(0, LIMITS.countryMax);
  const deviceType = clean(body.deviceType).slice(0, LIMITS.deviceMax);

  return {
    ok: true,
    value: {
      customerName,
      customerEmail,
      customerPhone: phoneRaw || null,
      customerCountry: customerCountry || null,
      deviceType: deviceType || null,
    },
  };
}

/**
 * Read a JSON body, refusing anything oversized BEFORE it is parsed.
 *
 * Counts bytes off the stream rather than trusting Content-Length, which the
 * caller sets and chunked encoding omits. Returns null for "too big or not a
 * JSON object" — the caller answers 400 either way, so the two need not be
 * told apart.
 */
export async function readJsonCapped(
  req: Request,
  maxBytes: number = LIMITS.bodyMaxBytes,
): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const reader = req.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  try {
    const merged = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      merged.set(c, at);
      at += c.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(merged));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Build the international number from the field and its country prefix.
 *
 * The checkout stores `customer_phone` WITHOUT the dial code — the prefix is
 * only ever rendered beside the input — so it has to be reattached. People also
 * type the code into the field itself, and a local trunk zero is a formatting
 * habit, so both are handled rather than assumed away.
 *
 * Shared deliberately: the precheck WRITES its answer under this key and the
 * payment-method evaluator READS it back. If the two derived it separately they
 * would drift, and a customer with WhatsApp would silently look unverified.
 */
export function toInternationalPhone(phone: unknown, phoneCode: unknown): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const code = String(phoneCode ?? "").replace(/\D/g, "");
  if (!digits) return null;

  let national = digits;
  if (code && national.startsWith(code)) national = national.slice(code.length);
  national = national.replace(/^0+/, "");
  const full = code ? code + national : national;
  return full.length >= LIMITS.phoneDigitsMin && full.length <= LIMITS.phoneDigitsMax ? full : null;
}

/**
 * Rebuild the key the precheck stored, from what a CREATE request carries.
 *
 * The two halves of the flow hold different things: step 1 posts the phone plus
 * the dial-code prefix, while a create request posts the phone plus an ISO
 * country code (the stored `customer_phone` has never included the dial code).
 * Both must land on the same key or a customer with WhatsApp looks unverified
 * at exactly the moment it decides whether they see PayPal.
 */
export function phoneKeyFromCountry(phone: unknown, countryCode: unknown): string | null {
  const code = String(countryCode ?? "").trim().toUpperCase();
  const dial = countries.find((c) => c.code === code)?.dial ?? "";
  return toInternationalPhone(phone, dial);
}
