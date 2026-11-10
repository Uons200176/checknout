# Premium IPTV Checkout

A multi-tenant checkout gateway for IPTV subscriptions, built with **Next.js 16** (App Router),
**TypeScript**, **Supabase** (PostgreSQL) and **TailwindCSS**. Customers pick a plan, enter their
details across a 3-step flow, and pay via cryptocurrency, card, or PayPal — with live payment
tracking and automatic session expiry.

> See [`PRD.md`](./PRD.md) for the full product/feature specification.

---

## Features

- **3-step checkout** — Personal info → Device info → Payment method
- **Four payment methods** (each individually toggleable in [`app/config/paymentMethods.ts`](app/config/paymentMethods.ts) and per-site via Supabase):
  - **Cryptocurrency** — [NOWPayments](https://nowpayments.io) invoices (30-min session)
  - **Card via Crypto** — [PayGate.to](https://paygate.to) redirect (60-min session)
  - **Credit / Debit Card** — PayGate redirect
  - **PayPal** — manual transfer with round-robin account assignment (20-min session)
- **Live payment status** — polls order status every 8s, embedded NOWPayments widget, countdown timer
- **Multi-tenant** — one deployment serves multiple brands; the active site is derived from the
  `Host` header (`checkout.<brand>` → `<brand>`), never from client input
- **Abuse protection** — per-IP rate limiting + Cloudflare Turnstile (remote-toggleable per site)
- **Automatic expiry** — a cron job cancels orders left in `awaiting_payment` past their session window
- **Confirmation emails** — sent via [Resend](https://resend.com) when an order completes
- **Per-brand plans & pricing** — the `site_plans` table gives each brand its own catalogue/prices
  (falls back to `Default` rows, then to [`app/data/plans.ts`](app/data/plans.ts)); prices are always
  resolved server-side in the payment create routes
- **Per-brand identity** — logo + display name in the header, tab title/favicon, footer support links,
  charge currency, and adaptive light/dark palette derived from `site_settings.theme_bg_color`
- **Localized UI** — checkout in EN/FR/ES/DE/AR (RTL) via `site_settings.default_language` or `?lang=xx`
- **Discount coupons** — per-brand or global codes in the `coupons` table, re-validated server-side
  at charge time
- **Abandoned-cart recovery (email)** — carts are captured at step 1 into `abandoned_carts`;
  `/api/cron/abandoned-carts` (CRON_SECRET-protected, run every 15–30 min) sends **at most one**
  localized, brand-styled Resend email per cart — to customers who never created an order
  (`?recover=1` resume link) or whose order never completed (`?retry=1` jumps back to payment).
  Customers with a completed order are never emailed. Tune the inactivity threshold with
  `ABANDONED_CART_DELAY_MINUTES` (default 45).

> **Database setup for the per-brand features:** run
> [`supabase-checkout-customization.sql`](./supabase-checkout-customization.sql) and
> [`supabase-abandoned-carts.sql`](./supabase-abandoned-carts.sql) once in the Supabase
> SQL editor. Everything is backward-compatible — without the migrations the checkout behaves
> exactly as before (and cart tracking simply no-ops).

---

## Getting Started

### Prerequisites

- Node.js 18.18+ (Next.js 16 requirement)
- A Supabase project (with an `orders` table and `site_settings` — see [`app/lib/database.types.ts`](app/lib/database.types.ts))
- Accounts/keys for NOWPayments, PayGate.to, Resend, and Cloudflare Turnstile (as needed)

### Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values (see Environment Variables)
npm run dev                  # http://localhost:3000
```

### Scripts

| Command         | Description                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Start the dev server             |
| `npm run build` | Production build                 |
| `npm run start` | Serve the production build       |
| `npm run lint`  | Run ESLint                       |

---

## Environment Variables

Copy [`.env.example`](./.env.example) to `.env.local` and fill in the values. Keys prefixed with
`NEXT_PUBLIC_` are exposed to the browser; all others are server-only and must never be committed.

| Variable | Scope | Description |
| -------- | ----- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Supabase service-role key (bypasses RLS — never expose) |
| `NOWPAYMENTS_API_KEY` | server | NOWPayments API key |
| `NOWPAYMENTS_IPN_SECRET` | server | Secret to verify NOWPayments webhook signatures |
| `PAYGATE_PAYOUT_WALLET` | server | PayGate.to payout wallet address |
| `PAYGATE_IPN_SECRET` | server | Secret to verify PayGate webhook callbacks |
| `RESEND_API_KEY` | server | Resend API key (confirmation emails) |
| `CRON_SECRET` | server | Shared secret protecting `/api/cron/cancel-expired` |
| `NEXT_PUBLIC_APP_URL` | public | Public base URL (used to build webhook/return URLs) |
| `SITE_HOSTNAME` | server | Fallback site identifier when the Host header can't be resolved |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | server | Cloudflare Turnstile secret key |

---

## Project Structure

```
app/
├─ page.tsx                    # Home — plan selection
├─ checkout/                   # Multi-step checkout + payment status pages
├─ components/                 # Reusable UI (forms, cards, step indicator, modal…)
├─ config/paymentMethods.ts    # Which payment methods are enabled
├─ data/                       # Static data (plans, countries)
├─ lib/                        # Server/client helpers
│  ├─ supabase.ts / supabaseAdmin.ts   # DB clients (anon vs service-role)
│  ├─ nowpayments.ts / paygate.ts      # Payment provider integrations
│  ├─ rateLimit.ts / turnstile.ts / captcha.ts   # Abuse protection
│  └─ site.ts                          # Host → site resolution (multi-tenant)
└─ api/
   ├─ payments/{crypto,card,paypal}/   # create / status / cancel endpoints
   ├─ webhooks/{nowpayments,paygate}/  # Provider payment confirmations
   └─ cron/cancel-expired/             # Auto-cancel expired orders
```

---

## Order Lifecycle

```
Plan selected → Checkout (3 steps) → Order created (awaiting_payment)
    ├─ Crypto  → payment-status → NOWPayments widget → webhook → completed
    ├─ Card    → PayGate redirect → webhook → completed
    ├─ PayPal  → paypal-pending → manual confirm → completed
    └─ Session expires → auto-cancelled (cron)
```

---

## Deployment

Deployed on **Vercel**. The cron job in [`vercel.json`](./vercel.json) hits
`/api/cron/cancel-expired` every 2 minutes; the endpoint authenticates the request against
`CRON_SECRET` (sent as a Bearer token by Vercel Cron). Configure all environment variables above
in the Vercel project settings.
