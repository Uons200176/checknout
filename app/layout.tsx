import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { getSiteConfigForRequest } from "./lib/site";
import { DEFAULT_ACCENT_COLOR, DEFAULT_BG_COLOR, deriveThemeVars, isValidHex } from "./lib/theme";
import { parseCheckoutTheme, THEME_HEADER } from "./lib/checkout-theme";

// Self-hosted at build time — no render-blocking request to Google, no layout
// shift, and no third-party font call (better privacy/GDPR posture).
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Per-brand tab title + favicon, resolved from the request's Host header —
// one deployment, each domain sees its own identity.
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const { site, config } = await getSiteConfigForRequest(headersList.get("host"));

  const brand = config.display_name || (config.site_name !== "Default" ? config.site_name : "") || site;
  const title = brand ? `${brand} — Secure Checkout` : "Secure Checkout";

  return {
    title,
    description: "Secure payment checkout",
    icons: config.logo_url ? { icon: config.logo_url } : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const { site, config } = await getSiteConfigForRequest(headersList.get("host"));

  const accent = isValidHex(config.theme_accent_color) ? config.theme_accent_color : DEFAULT_ACCENT_COLOR;
  const mode = parseCheckoutTheme(headersList.get(THEME_HEADER));
  const bgPrimary = mode === "light" ? "#ffffff" : mode === "dark" ? DEFAULT_BG_COLOR
    : isValidHex(config.theme_bg_color) ? config.theme_bg_color : DEFAULT_BG_COLOR;
  const themeSource =
    isValidHex(config.theme_accent_color) || isValidHex(config.theme_bg_color) ? "site" : "default";

  // Per-brand theme override — the FULL palette (surfaces, text, borders) is
  // derived from the two stored colors and applied as an INLINE style on
  // <html> so it always wins the cascade over globals.css, regardless of
  // stylesheet injection order. Rendered before first paint → no flash of the
  // wrong color. Light backgrounds automatically get a light palette.
  const themeStyle = deriveThemeVars(bgPrimary, accent) as React.CSSProperties;

  return (
    <html lang="en" className={inter.variable} style={themeStyle} data-checkout-theme={themeStyle.colorScheme}>
      <head>
        {/* Diagnostics: which brand the server resolved for this request and
            whether theme colors came from site_settings or code defaults.
            Visible via View Source — invaluable when debugging multi-brand issues. */}
        <meta name="checkout-site" content={config.site_name || site || "unknown"} />
        <meta name="checkout-theme" content={mode ?? themeSource} />
        <meta name="color-scheme" content={themeStyle.colorScheme} />
      </head>
      <body>{children}</body>
    </html>
  );
}
