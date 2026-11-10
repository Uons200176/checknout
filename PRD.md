# Product Requirements Document (PRD)
## Premium IPTV Checkout — Full Feature Specification

---

## 1. Project Overview

**Product Name:** Premium IPTV Checkout  
**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL), TailwindCSS  
**Base URL (local):** `http://localhost:3000`  
**Base URL (production):** `https://checkout.roomiptv.live`  

A multi-step checkout system that allows customers to select an IPTV subscription plan, provide personal and device information, and pay using one of four payment methods. The system tracks orders in Supabase, manages payment sessions with automatic expiry, and redirects to a live payment status page.

---

## 2. Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Home — Plan selection |
| `/checkout` | 3-step checkout (Personal Info → Device Info → Payment) |
| `/checkout/payment-status` | Step 4 — Live payment tracking (Crypto / Card) |
| `/checkout/paypal-pending` | Step 4 — PayPal manual payment instructions |

---

## 3. Feature Specifications

### 3.1 Home Page (`/`)

**Purpose:** Let the customer select a plan and number of connections before proceeding to checkout.

**Features:**
- Displays 4 subscription plans: Starter (1mo), Standard (3mo), Premium (6mo, most popular), Ultimate (12mo)
- **Connection Selector:** Allows choosing 1–5 simultaneous connections. Prices update dynamically.
- **Pricing logic:**
  - 1 connection: base prices ($1.99, $32.99, $52.99, $79.99)
  - Multipliers for extra connections: ×1 / ×1.75 / ×2.45 / ×3.10 / ×3.70
- Plans show: name, duration, per-month label, features list, "Most Popular" badge (Premium plan)
- Clicking a plan navigates to `/checkout?plan={planId}&connections={n}`
- Trust indicators: Secure Payment, Instant Activation, Money-Back Guarantee

**Test cases:**
- Home page loads without errors
- Connection selector changes prices across all 4 plans
- Clicking any plan card navigates to `/checkout` with correct query params
- "Most Popular" badge appears only on the Premium (6-month) plan
- Prices shown are correct for each connection count

---

### 3.2 Checkout Page — Step 1: Personal Information (`/checkout` step 1)

**Fields (all required):**
- Full Name (text)
- Email Address (email)
- Country (dropdown select from 200+ countries)
- Phone Number (tel — phone code auto-fills from country selection)

**Validation:**
- All 4 fields are required; clicking "Continue" without filling them shows an error: "Please fill in all required fields"
- Phone code prefix auto-updates when country changes

**Test cases:**
- Form renders with name, email, country, phone fields
- Clicking Continue with empty fields shows validation error
- Phone prefix auto-fills from country selection
- Valid data allows progression to Step 2

---

### 3.3 Checkout Page — Step 2: Device Information (`/checkout` step 2)

**Fields:**
- **Device Type** (dropdown, required-recommended): 
  Amazon Firestick/Fire TV, Smart TV Samsung, Smart TV LG, Apple TV, Android Phone/Tablet, Windows, iPhone/iPad (iOS), macOS, Google TV, MAG BOX, Formuler, Nvidia Shield, ChromeOS, Roku, Other
- **IPTV Player selection** (required): Radio buttons:
  - "Yes, I already have an IPTV Player"
  - "No, I want to use your IPTV Player"

**Validation:**
- The "Do you have an IPTV player?" selection is required; clicking "Continue" without selecting shows: "Please select whether you have an IPTV player"

**Test cases:**
- Device dropdown shows all 15 device options
- Clicking Continue without selecting IPTV player shows validation error
- Valid selection allows progression to Step 3

---

### 3.4 Checkout Page — Step 3: Payment Method (`/checkout` step 3)

**Available payment methods (when enabled):**
1. **PayPal** — Manual bank transfer via PayPal account
2. **Cryptocurrency** — Via NOWPayments (BTC, ETH, USDT, and more)
3. **Credit/Debit Card** — Via PayGate redirect
4. **Card via Crypto** — Card payment via crypto payment processor

**Behavior:**
- Only enabled payment methods appear (configured in `paymentMethods.ts`)
- User must select a payment method before submitting
- Clicking "Complete Order" without selection shows: "Please select a payment method"
- On submit, API call is made to create the order

**Order Summary sidebar shows:**
- Plan name and duration
- Number of connections
- Price breakdown (Subscription + Setup Fee: Free)
- Total
- Trust signals row: 256-bit SSL · Instant Activation · 24/7 Support

**Test cases:**
- Payment method cards render for all active methods
- Submitting without selecting payment method shows error
- Submitting with PayPal navigates to `/checkout/paypal-pending`
- Submitting with Crypto navigates to `/checkout/payment-status?method=crypto`
- Submitting with Card redirects to PayGate external URL
- Order Summary shows correct plan, connections, and price

---

### 3.5 Payment Status Page — Crypto & Card (`/checkout/payment-status`)

**Purpose:** Step 4 — Shows live payment status after order creation.

**URL params:** `orderId`, `invoiceId`, `method`, `status`

**Features:**
- Polls order status every 8 seconds (`/api/payments/crypto/status` or `/api/payments/card/status`)
- Shows embedded NOWPayments widget via official embed URL:  
  `https://nowpayments.io/embeds/payment-widget?iid={invoiceId}` (Crypto only)
- Shows "Open Payment Page" fallback button if widget fails to load (9-second timeout)
- **Session countdown timer:** Displays remaining time from `session_expires_at`
  - Normal: gold color
  - Warning (< 5 min): amber
  - Critical (< 1 min): red
- **Session durations:**
  - Cryptocurrency: 30 minutes
  - Card (PayGate): 60 minutes
- Order mini-card shows: Order #, Plan, Devices, Total
- Auto-refresh badge ("Auto-refreshing every 8s")
- Cancel button: cancels the order via API
- On payment confirmed (status = `completed`) → proceeds to Step 5 confirmation
- On cancelled → shows Step 5 failure state

**Test cases:**
- Page loads and fetches order data
- NOWPayments iframe renders (Crypto method)
- Session countdown timer shows correct remaining time
- Timer color changes to amber at < 5 min
- Timer color changes to red at < 1 min
- Polling badge is visible
- Cancel order button works and updates status
- Status transitions correctly: `awaiting_payment` → `completed` / `cancelled`

---

### 3.6 PayPal Pending Page (`/checkout/paypal-pending`)

**Purpose:** Step 4 — Instructions for manual PayPal payment.

**URL params:** `orderId`, `orderNumber`, `amount`, `currency`, `paypalEmail`, `expiresAt`

**Features:**
- Shows PayPal email to send payment to
- Shows exact amount and order number
- Step-by-step payment instructions (3 steps)
- Session countdown timer from `expiresAt` (20-minute session)
- "I've Made the Payment" button — triggers manual confirmation
- Cancel Order button
- Order status polling every 8 seconds

**Test cases:**
- Page loads with correct PayPal email, amount, order number
- Session timer counts down
- "I've Made the Payment" button triggers confirmation flow
- Cancel order button cancels and updates status

---

## 4. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments/crypto/create` | POST | Creates crypto payment order (NOWPayments) |
| `/api/payments/crypto/status` | GET | Returns order status + session expiry |
| `/api/payments/crypto/cancel` | POST | Cancels a crypto order |
| `/api/payments/card/create` | POST | Creates card payment (PayGate redirect) |
| `/api/payments/card/status` | GET | Returns card order status + session expiry |
| `/api/payments/paypal/create` | POST | Creates PayPal order and assigns PayPal account (round-robin) |
| `/api/payments/paypal/confirm` | POST | Marks PayPal order as confirmed |
| `/api/payments/paypal/cancel` | POST | Cancels a PayPal order |
| `/api/payments/paypal/save-txn` | POST | Saves PayPal transaction ID |
| `/api/webhooks/nowpayments` | POST | Webhook from NOWPayments for payment confirmation |
| `/api/webhooks/paygate` | POST | Webhook from PayGate for card payment confirmation |
| `/api/cron/cancel-expired` | POST | Cron job — auto-cancels expired awaiting_payment orders |

---

## 5. Order Lifecycle

```
Plan Selected → Checkout (3 steps) → Order Created (awaiting_payment)
    ↓
Payment Method
    ├─ Crypto → payment-status → NOWPayments iframe → webhook confirms → completed
    ├─ Card → PayGate redirect → webhook confirms → completed  
    ├─ PayPal → paypal-pending → manual confirm → completed
    └─ (any) Session expires without payment → auto-cancelled (server-side cron)
```

---

## 6. Order Session Expiry

- **Crypto:** 30-minute session window
- **Card (PayGate):** 60-minute session window
- **PayPal:** 20-minute session window
- Server-side cron job (`/api/cron/cancel-expired`) runs periodically to cancel expired orders still in `awaiting_payment` status

---

## 7. Mobile Responsiveness

- Home page: responsive grid for plans, connection selector
- Checkout page: single-column on mobile (< 900px), sidebar moves to top
- Payment status page: iframe takes full width on mobile (< 720px), sidebar stacks above
- PayPal pending page: info grid stacks on small screens (< 480px)

---

## 8. Key Test Scenarios (End-to-End)

1. **Full Crypto Flow:** Select plan → fill all steps → choose Crypto → verify payment-status page loads iframe → timer shows countdown
2. **Full PayPal Flow:** Select plan → fill steps → choose PayPal → verify paypal-pending page shows correct details → session timer shows 20 min
3. **Full Card Flow:** Select plan → fill steps → choose Card → verify redirect to PayGate
4. **Form Validation:** Attempt to continue each step with missing required fields → verify error messages
5. **Order Cancellation:** On payment-status page, cancel order → verify status updates to cancelled
6. **Session Expiry Display:** Verify timer shows correct time and changes color at thresholds
7. **Mobile Layout:** Verify all pages work correctly at 390px width (iPhone size)
