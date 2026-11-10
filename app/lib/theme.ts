/**
 * Per-site color theming.
 *
 * Only a single accent color + a single background color are stored per
 * brand (`site_settings.theme_accent_color` / `theme_bg_color`). Every
 * dependent shade (surfaces, text, borders, hover states) is derived here
 * rather than stored, to avoid schema bloat and keep every shade in sync
 * with the base colors.
 *
 * The derivation is luminance-aware: a light `theme_bg_color` produces a
 * full light palette (dark text, darker surfaces), a dark one produces the
 * dark palette — so the checkout adapts to any brand's look automatically.
 */

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_ACCENT_COLOR = "#c9a96e";
export const DEFAULT_BG_COLOR = "#0c0c0e";

export function isValidHex(value: string | null | undefined): value is string {
    return !!value && HEX_PATTERN.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace("#", "");
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
    ];
}

function lighten(hex: string, amount: number): string {
    const [r, g, b] = hexToRgb(hex);
    const mix = (c: number) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0");
    return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function darken(hex: string, amount: number): string {
    const [r, g, b] = hexToRgb(hex);
    const mix = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, "0");
    return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function withAlpha(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance 0–1 (0 = black, 1 = white). */
function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export interface AccentShades {
    accent: string;
    accentHover: string;
    accentMuted: string;
    accentBorder: string;
}

/** Derives the hover/muted/border shades used throughout the UI from a single base accent color. */
export function deriveAccentShades(hex: string): AccentShades {
    return {
        accent: hex,
        accentHover: lighten(hex, 0.15),
        accentMuted: withAlpha(hex, 0.15),
        accentBorder: withAlpha(hex, 0.3),
    };
}

/**
 * Derives the complete CSS-variable palette from the two stored brand colors.
 * With the default dark background this reproduces the palette that used to
 * live in globals.css; with a light background it flips to a light palette.
 */
export function deriveThemeVars(bgHex: string, accentHex: string): Record<string, string> {
    const isLight = luminance(bgHex) > 0.5;
    // Accent labels must remain legible on white and lightly tinted surfaces.
    // Target >= 4.5:1 on the darkest light surface, not just on the page itself.
    const relativeLuminance = (hex: string) => hexToRgb(hex).map(c => {
        const n = c / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    let accessibleAccent = accentHex;
    if (isLight) {
        const surfaceLuminance = relativeLuminance(darken(bgHex, 0.1));
        for (let i = 0; i < 40 && (surfaceLuminance + 0.05) / (relativeLuminance(accessibleAccent) + 0.05) < 4.5; i++) {
            accessibleAccent = darken(accessibleAccent, 0.08);
        }
    }
    const shades = deriveAccentShades(accessibleAccent);

    // Surfaces step away from the page background; borders sit slightly past
    // the surfaces. `lighten`/`darken` amounts tuned so the default dark bg
    // (#0c0c0e) reproduces the original hand-picked palette.
    const step = isLight
        ? (amount: number) => darken(bgHex, amount)
        : (amount: number) => lighten(bgHex, amount);

    return {
        "--accent": shades.accent,
        "--accent-hover": isLight ? darken(accessibleAccent, 0.12) : shades.accentHover,
        "--accent-muted": shades.accentMuted,
        "--accent-border": shades.accentBorder,

        "--bg-primary": bgHex,
        "--bg-secondary": step(0.03),
        "--bg-tertiary": step(0.055),
        "--bg-elevated": step(0.075),
        "--bg-hover": step(0.1),

        "--text-primary": isLight ? "#17171a" : "#e8e6e1",
        "--text-secondary": isLight ? "#4c4c52" : "#9a9a9e",
        "--text-tertiary": isLight ? "#595960" : "#6a6a6e",
        "--text-muted": isLight ? "#626269" : "#4a4a4e",

        "--on-accent": isLight ? "#ffffff" : bgHex,
        "--on-accent-manual": isLight ? "#ffffff" : "#0a0a0c",
        "--success": isLight ? "#15803d" : "#4ade80",
        "--error": isLight ? "#b91c1c" : "#f87171",
        "--danger-strong": isLight ? "#b91c1c" : "#ef4444",
        "--warning": isLight ? "#925a08" : "#f59e0b",
        "--info": isLight ? "#1d4ed8" : "#3b82f6",
        "--paypal-text": isLight ? "#006a96" : "#009cde",
        "--giftcard-text": isLight ? "#4f46a5" : "#818cf8",
        "--whatsapp-button": isLight ? "#147a39" : "#25D366",
        "--telegram-button": isLight ? "#126a95" : "#229ED9",
        "--overlay": isLight ? "rgba(24, 28, 38, 0.25)" : "rgba(0,0,0,0.75)",
        "--modal-shadow": isLight ? "0 24px 64px rgba(24,28,38,0.14)" : "0 24px 48px rgba(0,0,0,0.5)",
        "colorScheme": isLight ? "light" : "dark",

        "--border": step(isLight ? 0.17 : 0.07),
        "--border-hover": step(isLight ? 0.28 : 0.12),
        "--border-focus": shades.accent,
    };
}
