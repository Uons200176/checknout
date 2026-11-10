/**
 * Centralised plan & pricing data.
 *
 * Pricing is structured as:
 *   basePrices[planIndex] × connectionMultipliers[connections - 1]
 *
 * This file is the SINGLE SOURCE OF TRUTH for plan data.
 * Import it from any Next.js site that embeds this checkout.
 */

export interface Plan {
    id: string;
    name: string;
    duration: string;
    /** Duration in months — used for localized duration labels. */
    months?: number;
    price: number;        // USD, rounded to 2dp
    perMonthLabel: string;
    features: string[];
    popular?: boolean;
}

// ── Base prices for 1 connection ───────────────────────────────────────────
const BASE: { id: string; name: string; duration: string; months: number; features: string[]; popular?: boolean }[] = [
    {
        id: "1-month",
        name: "Starter",
        duration: "1 Month",
        months: 1,
        features: [
            "Full HD & 4K Streaming",
            "All Channels Included",
            "24/7 Support",
            "VOD Library Access",
        ],
    },
    {
        id: "3-months",
        name: "Standard",
        duration: "3 Months",
        months: 3,
        features: [
            "Full HD & 4K Streaming",
            "All Channels Included",
            "24/7 Priority Support",
            "VOD Library Access",
        ],
    },
    {
        id: "6-months",
        name: "Premium",
        duration: "6 Months",
        months: 6,
        popular: true,
        features: [
            "Full HD & 4K Streaming",
            "All Channels Included",
            "24/7 Priority Support",
            "VOD Library Access",
            "Catch-Up TV",
        ],
    },
    {
        id: "12-months",
        name: "Ultimate",
        duration: "12 Months",
        months: 12,
        features: [
            "Full HD & 4K Streaming",
            "All Channels Included",
            "24/7 VIP Support",
            "VOD Library Access",
            "Catch-Up TV",
            "Multi-Screen Support",
        ],
    },
];

/**
 * Exact Prices lookup per Plan ID and Connection count (1-5)
 */
const EXACT_PRICES: Record<string, Record<number, number>> = {
    '1-month': { 1: 12.00, 2: 25.00, 3: 30.00, 4: 39.00, 5: 45.00 },
    '3-months': { 1: 25.00, 2: 45.00, 3: 60.00, 4: 75.00, 5: 85.00 },
    '6-months': { 1: 45.00, 2: 69.00, 3: 85.00, 4: 110.00, 5: 125.00 },
    '12-months': { 1: 69.00, 2: 90.00, 3: 120.00, 4: 145.00, 5: 170.00 },
};

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

/**
 * Returns the 4 plans for a given connection count (1–5).
 * Prices are fetched directly from the EXACT_PRICES dictionary.
 */
export function getPlans(connections: number): Plan[] {
    const conn = Math.min(Math.max(connections, 1), 5); // Ensure bounds 1-5

    return BASE.map((b) => {
        const price = EXACT_PRICES[b.id]?.[conn] || 0;
        const perMonth = b.months === 1
            ? `$${price.toFixed(2)}/mo`
            : `~$${round2(price / b.months).toFixed(2)}/mo`;

        return {
            id: b.id,
            name: b.name,
            duration: b.duration,
            months: b.months,
            price,
            perMonthLabel: perMonth,
            features: b.features,
            popular: b.popular,
        };
    });
}

/** Quick lookup for checkout page (by planId) */
export function getPlanById(planId: string, connections: number): Plan | undefined {
    return getPlans(connections).find((p) => p.id === planId);
}
