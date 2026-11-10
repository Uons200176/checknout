# Payment Gateway — implementation checkpoint, 2026-09-09

## G2A / Rewarble redemption — 2026-09-16 (source ready; deploy both apps)

See [../REWARBLE-GIFTCARD.md](../REWARBLE-GIFTCARD.md). Submit/status now use
authenticated Core Backend redemption, not manual acceptance of a shaped code.
Provider value/currency/tolerance, duplicate prevention and uncertain recovery
are server-owned. G2A is hidden without exact purchase URL or Core configuration.
The customer sees an explicit consuming-card action and restored server result.

YONSTV migration LIVE but integrationOFF/keyempty/tolerance0. Backend and gateway
must BOTH be deployed before enabling; no live provider verification yet.40
gateway tests, type/lint/build and local fake-only phone white/dark checks passed.
No payout, FX, paid-trial conversion or Dashboard reconciliation UI added.

## URL-scoped white theme — 2026-09-10 (local; deploy gateway)

- Open `/checkout?plan=1-month&theme=light` or append `&theme=light` to an existing checkout query. `Light` is accepted; `theme=dark` explicitly chooses dark. Missing/invalid theme leaves existing per-brand appearance unchanged. No cookie or persistent preference affects another visit/tab.
- `proxy.ts` forwards the allowlisted URL mode as a request-only header; `app/layout.tsx` renders the complete inline HTML palette before first paint. No client-side after-mount color switch. Uses [Next.js request-header forwarding](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#setting-headers) because root layouts do not receive searchParams.
- Pure white page, coordinated light surfaces, readable labels and brand-accent buttons, semantic alerts, support badges, overlays and matching native-control/Turnstile color scheme. Existing dark colors/layout preserved; frontend-design review guided contrast and cohesion without replacing typography or content.
- Internal router push/replace preserves theme through PayPal, G2A, crypto/status, retry/home, reload, Back/Forward and PayGate return detection. NOWPayments success/cancel callback links retain theme; payment signatures, amounts, expiry, eligibility, IPN and order state unchanged. Third-party hosted pages/iframes remain provider-controlled.
- 34 Node tests passed (including SSR-without-JS, valid/invalid query, spoofed header, contrast, router and callback preservation), targeted lint/TypeScript and production build passed. Actual local HTTP200 HTML already white on Checkout + PayPal + G2A + payment-status; no-mode remains dark. Browser checks: white/dark, PayPal/G2A details, retry navigation, refresh and Back remained white with no console errors.
- Reproducible local-only preview: `node tests/theme-preview.cjs`, then `http://127.0.0.1:3107/checkout?theme=light`. Fake data service3108, no actual Supabase/Backend calls. PayPal fixture UUID00000000-0000-4000-8000-000000000001; G2A ends0002; expired PayPal ends0003. Stop with Ctrl+C. Preview dev font fetch can fall back offline; production build completed with the existing font configuration.
- Deploy the current PAYMENT-GATEWAY only. No schema migration, Backend/Dashboard edit, real order/payment, DNS change or live deployment was performed for this theme task.

## Dashboard alignment after eligibility v3

Local implementation, not a deployment claim. Flutter review drove loading/error, mounted-state, concurrent-edit and narrow-screen fixes. Supabase review checked live YONSTV fields and exercised rule/evaluator behavior in a rolled-back transaction.

| Dashboard operation | Core Backend contract |
| --- | --- |
| Load payment rules | GET /checkout/method-rules → rules, with site_name, payment_method, mode, require_whatsapp, allowed_countries |
| Enable/restrict/disable | PUT /checkout/method-rules/:site/:method → mode; omitted fields preserved by atomic checkout_set_method_rule |
| Change checks | Same PUT → requireWhatsapp, allowedCountries; explicit false/[] retained |
| Restore inheritance | DELETE /checkout/method-rules/:site/:method; brand falls back to default, not automatically enabled |
| Blocklist | GET /checkout/blocklist → entries; PUT /checkout/blocklist/:site with kind,value,reason; DELETE /checkout/blocklist/:id |
| Exact G2A links | GET /settings/pricing-overview; PUT /settings/pricing/:site with giftcardLink1..4 arrays indexed by connections−1 |
| Paid trial | PUT /settings/sites/:site with nested patch.paid_trial_price/paid_trial_giftcard_url/paid_trial_enabled |
| PayPal receiving-account switch | GET /settings/paypal-accounts; PUT /settings/paypal-accounts/:id/active with boolean active |

- Backend DB failures no longer masquerade as empty successful settings. Dashboard malformed lists/unconfirmed writes fail visibly. Payment configuration uses configured Core Backend only, not another Supabase discovery fallback.
- Payments panel reflects independent country membership, WhatsApp freshness and blacklist priority; scopes blocks, offers default restoration, guards concurrent edits/reloads. G2A enabled still requires exact configured link. Mobile block-button overflow corrected.
- G2A editor previously kept only slot 0 and advertised a fallback no longer used. All 20 slots are editable, positional blanks clearable, other links preserved. Removed writes to legacy giftcard_purchase_url. App/Backend validate HTTPS. Price input rejects nonpositive/nonfinite/gapped values. Pricing/trial remain separate writes: later failure does not roll back an earlier successful request.
- PayPal receiving-account read failure shows retry, repeated toggles are guarded, nonexistent account activation fails. Receiving-pool switch remains separate from method visibility. Active rails: paypal, crypto, card-crypto, giftcard. Legacy card rejected by admin/AI mutations; old DB entry preserved.
- All required fields/RPC verified in YONSTV. No schema migration or persistent merchant setting changes. New tests/payment-settings.sql rolls back all mode/brand changes and passed live.
- Verification: 20 Flutter API/widget/regression tests + 19 Backend + 28 gateway tests PASS; targeted Dart analysis clean, Backend production TypeScript compile PASS. No real payments, emails or customer checks.
- Windows release packaging FAILED: open DashBD PID 5512 locks WebView2Loader.dll (MSB3027/MSB3021). User asked to save/close app; not forcibly closed. Retry after closure. Still deploy latest Backend/gateway, verify v3, confirm Cloudflare trusted ingress/origin and perform pending legacy RPC cutover. No commit/push/deployment by assistant.

## Latest: PayPal eligibility v3 — deploy gateway/Backend before final cutover

**Live version check during this turn returned checkoutVersion 2** with providerGraceMinutes 60. The prior gateway/grace deployment is present, but this turn's v3 policy routes and G2A text are not verified deployed. Do not describe v3 as live end-to-end yet.

Policy in restricted mode:

| Condition | Decision |
| --- | --- |
| US phone/selected US, IP CA; both countries allowed; fresh positive WhatsApp | Allow |
| CA phone/selected CA, IP US; both countries allowed; fresh positive WhatsApp | Allow |
| Travel to an IP country outside the allow-list | Deny, regardless of home phone/WhatsApp |
| Missing/unknown IP, missing phone country, or selected/phone country outside allow-list | Deny |
| Blocklisted email, phone or country | Deny; PayPal blocklist also overrides enabled/no-rule mode |
| Required WhatsApp negative, unknown, stale, or prechecking switched off | Deny |

Countries need to belong to the allow-list independently; equality between them is NOT required. Country limits apply when mode=restricted and allowed_countries is nonempty; empty/null intentionally means no country filter. An enabled method bypasses optional restrictions, but not the PayPal blocklist. Disabled stays disabled. No actual merchant rules were changed; the existing PayPal list already includes US/CA and 19 other countries.

Implementation:

- Live additive migration `checkout_payment_eligibility_v3` (`20260909143431_checkout_payment_eligibility_v3.sql`) adds private `checkout_payment_eligibility` and operator-only atomic `checkout_set_method_rule`; existing RPC ACLs preserved. The signed dispatcher exposes `payment_eligibility_v3` and `create_order_v3` actions. Order creation rechecks policy inside the database before consuming the challenge/creating the order. Original TTL, pricing and review protections remain.
- `payment-identity.ts` uses pinned libphonenumber-js/max 1.13.12 to normalize national/international numbers, distinguish US/CA sharing +1, and avoid double-prefixing international numbers. Selected country cannot rewrite an explicitly international phone's country. Metadata parsing is not proof of phone ownership; WhatsApp registration check remains separate. See [upstream phone parsing documentation](https://github.com/catamphetamine/libphonenumber-js).
- `payment-eligibility.ts` is shared by `/api/checkout/pricing` and all four `/api/payments/*/create` routes. It awaits the same normalized WhatsApp precheck, takes IP country only from cf-ipcountry, and signs the decision inputs. No caller-supplied IP/country verdict is accepted. No cards appear until pricing resolves; all create routes reject non-true verdicts.
- `/api/checkout/precheck` accepts selected country for the same normalization; the old phoneCode-only probe remains compatible during rollout. Existing customer-input phoneKey helper is no longer used by new eligibility routes.
- Backend `/checkout/method-rules/:siteName` and AI `manage_payment_method_rules` use the atomic rule patch. Omitted fields are preserved; []/null explicitly clears the filter, country values normalize/deduplicate, malformed inputs fail. Partial brand overrides inherit default rules instead of accidentally opening PayPal. Operator/AI authentication and confirmation requirements unchanged.
- Backend `/gateway/whatsapp-check` chooses a connected account (prefers default), instead of failing every checkout when default is disconnected but account 2 is online. Explicit session selection remains respected; no session creation/reconnection or message sending was added.
- Dependency audit found a critical advisory in the previous Next.js 16.3.1. Updated to pinned 16.3.4 and refreshed its runtime dependencies, then rebuilt and reran 28 tests successfully. `npm audit --omit=dev` now reports ZERO vulnerabilities. Full audit retains 6 development-tool advisories (3 moderate, 3 high); unrelated dev-tool upgrades were not forced.
- Supabase/Postgres guidance informed fixed search paths, private function grants, atomic rule updates and transaction-only fixture tests. Existing project advisor warnings remain, including legacy function grants ([remediation guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)).

Verification: 28 gateway tests and 14 Backend tests passed; Next production build and Backend build passed. Live rollback SQL tests cover country combinations, travel/unknown IP, stale/negative/unknown WhatsApp, case-insensitive priority blocklist, brand/global scope, rule patch preservation, actual signed order creation and function ACLs. Final audit: zero fixture orders/blocks; actual rules unchanged. Gateway targeted ESLint and the changed Backend gateway controller pass. The existing checkout service still has unrelated formatting/unsafe-assignment lint debt outside the modified rule method; no broad cleanup was performed.

Changed-path lint check: no findings in the modified setMethodRule method; 30 existing findings elsewhere in checkout.service.ts. The initial rendered test harness needed a host-realm options adapter for the phone library's Object check; this was a VM test-boundary issue, not a production parsing fallback.

Deployment requirements / limits:

1. Deploy latest PAYMENT-GATEWAY and Backend. `/api/checkout/version` must return checkoutVersion 3 and eligibilityPolicy `country-allowlist-v3`.
2. Verify actual trusted ingress: Cloudflare IP geolocation enabled, cf-ipcountry overwritten, origin inaccessible directly or protected by authenticated ingress. Application code alone cannot establish the trust of a forwarded header; VPN/proxy exit geography is not proof of physical location. Missing/unknown country fails closed.
3. Complete the previously prepared legacy RPC cutover after deployment verification. It is still NOT applied: old `create_order`, `precheck_record` and related public RPC paths remain until coordinated revocation. Do not claim raw-anon bypass paths are closed before this step. The new strict functions themselves are private and signed routes are ready.
4. No real customer WhatsApp probe, purchase, PayPal assignment, email or payment was made. Real eligible-customer smoke checks remain post-deployment.

## Latest UI update: G2A code retrieval instructions

- Gift-card checkout now separates buying, retrieving the code, and submitting it into three numbered sections. Retrieval follows the operator's supplied flow: G2A purchase email → Get order → scroll to gift card → reveal/generate code → copy back here. Button wording may vary; no unsupported promise of instant delivery or no sign-in.
- Prominent warning beside the input: gift-card code, NOT G2A order number/Order ID/payment reference. Checkout summary reference is also explicitly labelled as not the code. Inbox/Spam guidance and already-paid/do-not-buy-again help included.
- UI and submission error copy now match the existing 16–19 alphanumeric format; validation, payment rules, expiry, database and Backend are unchanged. Format validation does NOT prove a code is genuine or identify every order number of the same length; human review is retained.
- Accessible input description/error linkage and alert added. Frontend-design guidance used to preserve the existing theme while making the retrieval step and input warning distinct.
- Verification: 25 checkout tests passed, including rendered guide/accessibility and invalid-code API response; TypeScript and targeted ESLint passed. UI changes remain local until PAYMENT-GATEWAY deployment; no real card purchase, submission or customer messages.

## Latest update: exact G2A links and provider grace hour

- G2A is available only when the canonical site's exact plan AND connection slot has a valid HTTPS purchase link. No first-connection, site-wide, environment or unrelated default-row fallback. Pricing omits the rail and the create endpoint also rejects it when missing.
- Customer deadlines are unchanged: PayPal 30m, G2A 2h, Card Crypto 12h, Crypto 5h. The extra hour is NOT additional time to initiate payment.
- Applied LIVE on YONSTV: `checkout_provider_grace_hour` (local `20260908232007_checkout_provider_grace_hour.sql`). During the hour after crypto/card customer expiry, the database keeps an unpaid order awaiting_payment for independent provider checking. Public checkout status projects a closed session, removes invoice access and returns session_expired/reconciliation_pending/reconciliation_until. No provider credentials are exposed.
- Database cancellation cron and backup expiry list both wait for the extra hour, and still cancel ONLY awaiting_payment. Provider reconciliation selection and the server request guard stop at expiry + 1 hour: Crypto 6h total, Card Crypto 13h total from creation. Processing/pending are preserved for review.
- New page text distinguishes session expiry from payment failure and hides Try Again while reconciliation is pending. Status polling continues to show late payment updates.
- Verified authenticated settlements can still move cancelled orders to pending/processing even after scheduled checks stop; real received funds are not discarded because of a timer. Pending remains HUMAN review, never automatic account delivery.
- Verification: 23 mocked checkout tests PASS; expanded live rollback-only lifecycle tests PASS (both providers, both expiry crons, exact customer/backend separation, late settlement and pending/processing protection); TypeScript, targeted ESLint and Next production build PASS. No test orders remain. No real purchase/email/provider callback was sent.
- Supabase/Postgres guidance used fixed search paths, existing ACL preservation and transactional tests; private get_checkout_order remains inaccessible to anon. Existing project advisor warnings remain, including legacy RPC grants pending cutover ([Supabase remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)); no unrelated policies were changed.
- Deployment is still required for the new gateway UI/routes and the previously prepared Backend maintenance worker. Verify version endpoint includes providerGraceMinutes: 60 and giftcardExactPlanLink: true, then finish the separately documented RPC cutover. Do not apply every migration blindly.
- Remaining limitation: a missing FIRST NOWPayments webhook can leave no saved payment_id for API polling; this remains deferred/operator review. The grace hour does not create a provider lookup credential or revoke an already-open external payment page/wallet.

The sections below describe the previous base implementation; this update supersedes earlier expiry wording.


## State

Implemented in PAYMENT-GATEWAY and its Backend gateway module only. No CONTROL or DASHBOARD edits, real purchases, customer messages, or real receipt sends. Database: YONSTV (`gofcbtdoltfnawmlpmeo`), verified against both projects' environment configuration.

**Deployment and final security cutover are still pending.** The production checkout version endpoint last returned 404 (old deployment), while the local production server returned checkoutVersion 2. Do not describe all changes as deployed.

## Payment sessions

| Method | Server deadline |
| --- | --- |
| PayPal | 30 minutes |
| G2A / Gift Card | 2 hours |
| Card Crypto | 12 hours |
| Crypto | 5 hours |

The existing random order UUID is the customer payment capability. Its deadline is stored and calculated by Postgres; customer-supplied deadlines and PayPal recipients are ignored. Payment actions expire; read-only status remains available to show cancellation or review. The existing minute-by-minute database cron cancels only awaiting_payment (after the provider grace hour where applicable). Customer status reads and manual submissions enforce the original customer deadline independently of cron timing or the browser clock.

Pending/processing orders cannot be cancelled by checkout expiry or the customer. A verified late provider settlement can recover an expired/cancelled order into pending or processing for HUMAN review. Gateway code cannot set completed, provision accounts, renew subscriptions, or activate Player.

PayPal/Gift Card pages load saved amounts, account, order details and deadlines from server status, not query parameters. Amounts retain exact cents. Countdown is display-only and uses server time; it requests a server refresh instead of cancelling locally. Cancellation keeps the order identity. Card entry/resume uses a server-checked redirect capability; crypto widgets use the invoice saved against the order.

## Other repairs

- No payment cards before step 3 or before eligibility finishes. Old cards are cleared on re-entry; stale responses cannot repopulate them. Database errors fail closed with retry UI. A failed security-challenge fetch also has an explicit retry instead of an indefinitely disabled button.
- Eligibility precheck is awaited by server pricing. Unsupported card rail excluded. Existing disabled/restricted rules were not changed.
- No hardcoded price fallback when database pricing is unavailable, and no blank-plan crash. Provider invoice amounts use the saved database price, not an earlier quote.
- Missing invoice/wallet reference persistence returns 503 without exposing a payment URL. Provider calls have timeouts.
- NOWPayments webhook binds authenticated events to method, order, invoice, fiat amount and currency; payment IDs are retained. PayGate verifies order-specific token, saved wallet/reference and amount; non-USD comparison/abnormal amounts require review.
- VPS worker calls an authenticated reconciliation endpoint independent of browsers. PayGate uses its saved ipn_token. NOWPayments uses a known payment_id; the old incorrect unauthenticated list-payments fallback was removed.
- Receipt delivery uses a private durable outbox, atomic lease, frozen request body, provider result checks, bounded retries and one idempotency key per order. Existing per-address/site cooldown remains. Six failed attempts or a 22-hour uncertainty window require operator review. The trigger queues only server-v2 transitions, avoiding duplicate sends from an old deployment during rollout.
- App-secret HMAC updates synchronize with SQL clearance secrets. No service-role key is shipped to the checkout/browser. Headers prevent payment capability referrer leakage and caching of payment APIs.

## Live migrations / rollout

Applied via Supabase:

1. `checkout_server_authority` — lifecycle locks, exact deadlines, signed dispatcher, protected receipt outbox/worker RPC, HMAC sync; adds GATEWAY_CHECKOUT_URL for VPS reconciliation.
2. `checkout_status_capabilities` — authoritative invoice/site status subset.
3. `checkout_dispatch_null_guards` — explicitly reject NULL action/payload before HMAC validation.
4. `checkout_provider_grace_hour` — separate customer expiry from one-hour provider reconciliation grace.

Prepared but **NOT applied**: `20260908164425_checkout_rpc_server_only_cutover.sql`.

Rollout order:

1. Deploy latest PAYMENT-GATEWAY and Backend code (no WhatsApp volume changes).
2. Verify `/api/checkout/version` returns checkoutVersion 2, providerGraceMinutes 60 and giftcardExactPlanLink true, live pricing/challenge calls work, and Backend logs show the new maintenance worker without errors.
3. Apply the prepared cutover migration: revoke legacy public/anon/authenticated mutation, challenge, precheck, receipt-claim and order-read RPCs; retain service_role access and the signed dispatcher.
4. Verify direct legacy anon calls fail, signed server calls work, and no duplicate receipt sends.

Do not blindly run all migration files before deploying v2. Legacy RPC exposure remains until the coordinated cutover. Never put service_role into Next public environment variables to work around a cutover error.

## Verification

- Next production build and TypeScript checks passed.
- Backend production build passed using tsconfig.build.json; generic root tsc includes unrelated Deno/e2e sources and is not the Nest build configuration.
- Targeted ESLint clean.
- 16 mocked checkout tests and 5 new receipt-worker tests passed; 4 existing email regression tests also passed. No actual provider calls in these tests.
- Live SQL transaction tests passed for all four deadlines, price/recipient tampering, cross-method rejection, expiry, late settlement, pending protection, outbox insertion, rejection of automatic completed and invalid/NULL HMAC requests. All fixture rows/rule changes rolled back; final orders/outbox counts were 0.
- Local production HTTP smoke: checkout/version 200, checkout page 200, unknown order 404, pricing 200 and correct restricted/disabled verdicts, via the actual Backend/Supabase configuration.
- Browser UI tested with isolated intercepted test requests: no methods while loading, only permitted method after reply, no old methods on back/re-entry, retry on failure. Interception and temporary tab were removed; Complete Order was never clicked.
- Supabase advisors: checkout_receipts has RLS and no public grants/policies intentionally (server only). Signed checkout_dispatch remains anon-executable by design, but requires an action/payload HMAC. Existing unrelated advisories were not broadly changed. See [RLS no-policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [definer-function review](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Commands:

- PAYMENT-GATEWAY: `node --test tests/checkout.test.cjs`, `npx tsc --noEmit --incremental false`, `npm run build`.
- Backend: `npm run build`, `node --test test/gateway-maintenance.test.mjs test/email-contract.test.mjs`.
- SQL fixture: `tests/checkout-lifecycle.sql` (entire BEGIN/ROLLBACK transaction; never execute fragments or remove ROLLBACK).
- Never boot the full Backend locally just for tests; this would start WhatsApp/AI workers.

## Remaining configuration / limits

1. G2A purchase links are absent from current pricing/site/env settings. Gift Card is withheld when no valid HTTPS purchase link exists; operator must provide the correct per-site/per-plan links. No link or product was invented.
2. The site's deadline blocks its own payment entry/actions. It does NOT remotely revoke a PayGate wallet, an already-open NOWPayments invoice, or prevent someone sending money directly to PayPal. Current provider integration exposes no verified revocation mechanism. Late real money is retained for review, never silently discarded.
3. If NOWPayments' first webhook never arrives, no payment_id may be available. Full recovery then needs a verified provider-side lookup/integration (the list API requires authorization not present in the current configuration) or operator reconciliation. This case is recorded as deferred; not falsely reported as payment success.
4. Real provider settlement/email deliverability and the VPS scheduler still require post-deployment smoke verification. No real-money test was performed.
5. Receipt jobs in needs_review require operator investigation; no new Dashboard retry screen was added in this scoped change. Resend idempotency expires after 24 hours, hence automatic retries stop before that boundary: [official documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
