/**
 * Currency display helpers — client-safe (plain data only).
 *
 * The charge currency comes from `site_settings.currency` per brand and
 * defaults to USD, preserving today's behavior for unconfigured sites.
 */

const SYMBOLS: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CAD: "C$",
    AUD: "A$",
    CHF: "CHF ",
    MAD: "MAD ",
    AED: "AED ",
    SAR: "SAR ",
};

export function normalizeCurrency(code: string | null | undefined): string {
    const c = (code || "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? c : "USD";
}

export function currencySymbol(code: string | null | undefined): string {
    const c = normalizeCurrency(code);
    return SYMBOLS[c] ?? `${c} `;
}

export function formatMoney(amount: number, code: string | null | undefined): string {
    return `${currencySymbol(code)}${amount.toFixed(2)}`;
}
