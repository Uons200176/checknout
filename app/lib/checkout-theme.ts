/** URL-scoped appearance only: never stored in shared cookies or payment state. */
export type CheckoutTheme = "light" | "dark";
export const THEME_HEADER = "x-checkout-theme";

export function parseCheckoutTheme(value: string | null | undefined): CheckoutTheme | null {
    const normalized = value?.trim().toLowerCase();
    return normalized === "light" || normalized === "dark" ? normalized : null;
}

/** Only relative, same-site links. Never rewrite a provider URL or its signature. */
export function withCheckoutTheme(href: string, theme: string | null | undefined): string {
    const mode = parseCheckoutTheme(theme);
    if (!mode || !href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return href;
    const url = new URL(href, "https://checkout.invalid");
    if (url.origin !== "https://checkout.invalid") return href;
    url.searchParams.set("theme", parseCheckoutTheme(url.searchParams.get("theme")) ?? mode);
    return `${url.pathname}${url.search}${url.hash}`;
}

/** Read at navigation time, not after first paint and not from persistent storage. */
export function themedCheckoutHref(href: string): string {
    if (typeof window === "undefined") return href;
    return withCheckoutTheme(href, new URLSearchParams(window.location.search).get("theme"));
}
