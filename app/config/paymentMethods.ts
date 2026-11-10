/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          PAYMENT METHODS CONFIGURATION                  ║
 * ║                                                         ║
 * ║  To disable a payment method, set  enabled: false       ║
 * ║  To re-enable it,               set  enabled: true      ║
 * ║                                                         ║
 * ║  Changes take effect immediately on the next page load. ║
 * ╚══════════════════════════════════════════════════════════╝
 */

export interface PaymentMethodConfig {
    id: string;
    name: string;
    description: string;
    badge?: string;
    enabled: boolean;
}

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
    {
        id: "paypal",
        name: "PayPal",
        description: "Pay securely with your PayPal account",
        // On. WHO actually sees it is decided per customer by
        // payment_method_rules — enabled / disabled / restricted.
        enabled: true,
    },
    {
        id: "crypto",
        name: "Cryptocurrency",
        description: "Bitcoin, Ethereum, USDT and more",
        enabled: true,
    },
    {
        id: "card",
        name: "Credit / Debit Card",
        description: "Pay with your bank card",
        // Has NO create route and no entry in PAYMENT_ENDPOINTS. Turning this on
        // shows the customer a card that then fails with "not configured yet" —
        // "Card via Crypto" below is the real card rail.
        enabled: false,
    },
    {
        id: "card-crypto",
        name: "Card via Crypto",
        description: "Pay with card through a crypto payment processor",
        badge: "Different from above",
        enabled: true,
    },
    {
        id: "giftcard",
        name: "Credit / Debit Card (Gift Card)",
        description: "Pay by card via a prepaid gift card — enter the 16-digit code",
        enabled: true,
    },
];

/** Returns only the payment methods that are currently enabled (code defaults, no per-site override). */
export const ACTIVE_PAYMENT_METHODS = PAYMENT_METHODS.filter((m) => m.enabled);

/**
 * @deprecated Superseded by `payment_method_rules` (mode = enabled | disabled |
 * restricted), which is now the single place a method is switched on or off.
 * Kept only so nothing that still imports it breaks; the checkout no longer
 * calls it, and `site_settings.payment_methods_enabled` is no longer read.
 *
 * Having both meant two switches for one decision, and this one ran FIRST — a
 * method turned off here never reached the rules, so the rules panel looked
 * broken rather than overridden.
 */
export function getActivePaymentMethods(
    siteOverrides: Record<string, boolean> | null | undefined
): PaymentMethodConfig[] {
    return PAYMENT_METHODS.filter((m) => {
        const override = siteOverrides?.[m.id];
        return typeof override === "boolean" ? override : m.enabled;
    });
}
