const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, {
    exports, require: name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith('/checkout-theme')) return load('app/lib/checkout-theme.ts');
      if (name.endsWith('/giftcard-display')) return load('app/lib/giftcard-display.ts');
      if (name.endsWith('/use-checkout-router')) return { useCheckoutRouter: () => ({ push() {}, replace() {} }) };
      if (name.startsWith('node:') || name === 'crypto') return require(name);
      throw Error('Unmocked dependency: ' + name);
    },
    URL, URLSearchParams, Headers, AbortSignal, Buffer, Date, process: { env: {} },
    console: { log() {}, error() {}, warn() {} }, ...globals,
  }, { filename: file });
  return exports;
}
const next = { NextResponse: { json: (body, init) => ({ status: init?.status || 200, body }), redirect: (url, init) => ({ status: init.status, url }) } };
test('G2A guide renders email, Get order, reveal and paste steps with an accessible order-number warning', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const screen = load('app/checkout/giftcard-pending/GiftcardPendingClient.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useSearchParams: () => new URLSearchParams('orderId=fixture'), useRouter: () => ({ push() {} }) },
    '../../lib/use-checkout-order': { useCheckoutOrder: () => ({ order: { status: 'awaiting_payment', orderNumber: 123, planPrice: 19.99 }, refresh() {}, displayExpiresAt: '2099-01-01' }) },
    '../../components/CheckoutHeader': { default: () => null },
    '../../components/CheckoutFooter': { default: () => null },
    '../../components/UnifiedStepIndicator': { default: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(screen.default, { purchaseUrl: 'https://store.example.invalid' }));
  assert.match(html, /Open your email inbox/);
  assert.match(html, /Get order/);
  assert.match(html, /Scroll down to the gift card/);
  assert.match(html, /Copy the revealed gift-card code/);
  assert.match(html, /NOT the G2A order number/);
  assert.match(html, /Do not buy another card/);
  assert.match(html, /aria-describedby="giftcard-code-warning giftcard-code-hint"/);
  assert.match(html, /Checkout reference \(not the gift-card code\)/);
  assert.doesNotMatch(html, /16-digit|only takes a minute|No account or sign-in/);
});
test('G2A invalid code response explains how to retrieve the code, without submitting an order number', async () => {
  let submitted = false;
  const route = load('app/api/payments/giftcard/submit/route.ts', {
    'next/server': next,
    '@/app/lib/customer-input': { readJsonCapped: async () => ({ orderId: 'fixture', code: '123456' }) },
    '@/app/lib/giftcard-backend': { redeemGiftcard: async () => { submitted = true; }, GiftcardBackendError: class extends Error {} },
  });
  const result = await route.POST({});
  assert.equal(result.status, 400);
  assert.match(result.body.error, /not the order number/);
  assert.match(result.body.error, /Get order/);
  assert.equal(submitted, false);
});
const verification = load('app/lib/payment-verification.ts');
test('Rewarble setup unavailable prevents creation before any order or provider write', async () => {
  const { route, calls } = createRoute('giftcard', { noRedemption: true });
  assert.equal((await route.POST({ headers: new Headers() })).status, 503);
  assert.equal(calls.length, 0);
});
test('giftcard submit forwards only identity and normalized code; never browser value or a manual confirmation', async () => {
  const id = 'c0000000-0000-4000-8000-000000000001';
  const calls = [];
  const route = load('app/api/payments/giftcard/submit/route.ts', {
    'next/server': next,
    '@/app/lib/customer-input': { readJsonCapped: async () => ({ orderId: id, code: 'abc-123 abc123', price: 0.01, state: 'production', currency: 'USD' }) },
    '@/app/lib/giftcard-backend': { GiftcardBackendError: class extends Error {}, redeemGiftcard: async (...args) => { calls.push(args); return { status: 'processing', redemption: { state: 'review', reason: 'underpaid' } }; } },
  });
  const response = await route.POST({});
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[id, 'ABC123ABC123']]);
  assert.equal(response.body.redemption.state, 'review');
  assert.equal(response.body.ok, undefined);
});
test('giftcard backend bridge uses dedicated server credential, no client price and no payout URL', async () => {
  let calls = 0;
  const bridge = load('app/lib/giftcard-backend.ts', { './runtime-config': { cfg: async k => { assert.equal(k, 'GATEWAY_REDEEM_KEY'); return 'fixture'; } } }, {
    process: { env: { BACKEND_URL: 'https://core.example.invalid' } },
    fetch: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://core.example.invalid/gateway/giftcards/redeem');
      assert.equal(options.headers['x-giftcard-key'], 'fixture');
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers['x-api-key'], undefined);
      return { ok: true, json: async () => ({ status: 'pending', redemption: { state: 'verified' } }) };
    },
  });
  assert.equal((await bridge.redeemGiftcard('fixture', 'ABC123ABC123')).status, 'pending');
  assert.equal(calls, 1);
});
test('giftcard bridge never falls back to local/manual acceptance on disconnect', async () => {
  const bridge = load('app/lib/giftcard-backend.ts', { './runtime-config': { cfg: async () => 'fixture' } }, {
    process: { env: { BACKEND_URL: 'https://core.example.invalid' } }, fetch: async () => { throw Error('offline'); },
  });
  assert.equal(await bridge.giftcardAvailable(), false);
  await assert.rejects(bridge.redeemGiftcard('fixture', 'ABC123ABC123'), e => e.status === 503 && /Do not submit a different card/.test(e.message));
});
test('giftcard page restores verified, shortfall, mismatch and uncertain server states without exposing code', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const [state, reason, expected] of [
    ['verified', '', 'Payment Verified'], ['redeeming', '', 'Checking Your Gift Card'],
    ['review', 'underpaid', 'below the amount accepted'], ['review', 'currency_mismatch', 'different currency'],
    ['uncertain', 'interrupted', 'needs manual verification'],
  ]) {
    const screen = load('app/checkout/giftcard-pending/GiftcardPendingClient.tsx', {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
      'next/navigation': { useSearchParams: () => new URLSearchParams('orderId=fixture') },
      '../../lib/use-checkout-order': { useCheckoutOrder: () => ({ order: { status: state === 'verified' ? 'pending' : 'processing', orderNumber: 123, planPrice: 20, redemption: { state, reason, codeLast4: 'C123', faceValue: 19, currency: 'USD' } }, refresh() {} }) },
      '../../components/CheckoutHeader': { default: () => null }, '../../components/CheckoutFooter': { default: () => null }, '../../components/UnifiedStepIndicator': { default: () => null },
    });
    const html = renderToStaticMarkup(React.createElement(screen.default));
    assert.ok(html.includes(expected), expected);
    assert.match(html, /USD 19(?:\.00)?</);
    assert.doesNotMatch(html, /ABC123ABC123/);
    assert.doesNotMatch(html, /Confirm Code|10 minutes/);
  }
});
const saved = { order_number: 123, payment_method: 'crypto', plan_price: 19.99, payment_reference: { invoice_id: '42', price_currency: 'usd' } };
const payment = { order_id: '123', invoice_id: 42, payment_id: 500, price_amount: 19.99, price_currency: 'usd' };
test('provider verification accepts the matching saved invoice only', () => {
  assert.equal(verification.verifyNowPayment(saved, payment), true);
  for (const change of [{ invoice_id: 43 }, { order_id: 124 }, { price_amount: 0.01 }, { price_currency: 'eur' }, { payment_id: 'x' }]) {
    assert.equal(verification.verifyNowPayment(saved, { ...payment, ...change }), false);
  }
  assert.equal(verification.verifyNowPayment({ ...saved, payment_method: 'paypal' }, payment), false);
});
test('card underpayment and non-USD proceeds require manual investigation', () => {
  assert.equal(verification.paygateReviewStatus(saved, 19.99), 'pending');
  for (const value of [0, 'NaN', 'Infinity', 1]) assert.equal(verification.paygateReviewStatus(saved, value), 'processing');
  assert.equal(verification.paygateReviewStatus({ ...saved, payment_reference: { price_currency: 'eur' } }, 19.99), 'processing');
});
function createRoute(method, options = {}) {
  const calls = [];
  const rpc = {
    paymentDb: { rpc: async () => ({ data: options.denied ? null : { paypal: true, giftcard: true, crypto: true, 'card-crypto': true } }) },
    createOrder: async args => {
      calls.push(['create', args]);
      return { order: { id: 'fixture-id', order_number: 123, plan_price: 23.25, plan_name: 'Saved plan', connections: 1, session_expires_at: '2030-01-01T00:30:00Z' } };
    },
    assignPaypalAccount: async () => ({ paypalEmail: 'recipient@example.invalid' }),
    updateOrderReference: async () => options.storageFails ? 'storage unavailable' : null,
    applyOrderStatus: async () => ({ result: { applied: true } }),
  };
  const mocks = {
    'next/server': next, '@/app/lib/orders.rpc': rpc,
    '@/app/lib/giftcard-backend': { giftcardAvailable: async () => !options.noRedemption },
    '@/app/lib/payment-eligibility': { paymentEligibility: async () => ({ verdicts: options.denied ? null : { paypal: true, giftcard: true, crypto: true, 'card-crypto': true }, identity: { phoneKey: '12025550100', phoneCountry: 'US' }, ipCountry: 'CA' }) },
    '@/app/lib/customer-input': {
      readJsonCapped: async () => ({ token: 'fixture', nonce: '1', planId: '1-month', connections: 1 }),
      validateCustomer: () => ({ ok: true, value: { customerName: 'Test Person', customerEmail: 'test@example.invalid' } }),
      phoneKeyFromCountry: () => null,
    },
    '@/app/lib/plans.server': { getSitePlanById: async () => ({ id: '1-month', name: 'Old quote', price: 10 }), getGiftcardPurchaseUrl: async () => options.noStore ? null : 'https://store.example.invalid' },
    '@/app/lib/currency': { normalizeCurrency: () => 'USD' },
    '@/app/lib/turnstile': {},
    '@/app/lib/paygate': {
      createPaygateWallet: async () => { calls.push(['provider']); return { address_in: 'fixture', ipn_token: 'fixture' }; },
      buildIpnCallbackUrl: async () => 'https://example.invalid/callback',
    },
    '@/app/lib/nowpayments': { createCryptoInvoice: async args => {
      calls.push(['provider', args]); return { id: '42', invoice_url: 'https://nowpayments.io/fixture' };
    } },
  };
  return { route: load('app/api/payments/' + method + '/create/route.ts', mocks), calls };
}
for (const method of ['paypal', 'giftcard', 'crypto', 'card']) {
  test(method + ': missing eligibility fails closed before creating an order', async () => {
    const { route, calls } = createRoute(method, { denied: true });
    assert.equal((await route.POST({ headers: new Headers() })).status, 403);
    assert.equal(calls.length, 0);
  });
  test(method + ': database owns checkout expiry; no caller deadline is forwarded', async () => {
    const { route, calls } = createRoute(method);
    const result = await route.POST({ headers: new Headers(), nextUrl: new URL('https://example.invalid?theme=Light') });
    assert.equal(result.status, 200);
    assert.equal('session_expires_at' in calls.find(c => c[0] === 'create')[1].order, false);
    assert.equal(calls.find(c => c[0] === 'create')[1].order.customer_ip_country, 'CA');
    assert.equal(calls.find(c => c[0] === 'create')[1].order.customer_phone_country, 'US');
    if (method === 'paypal' || method === 'giftcard') {
      assert.equal(result.body.planPrice, 23.25);
      assert.equal(result.body.expiresAt, '2030-01-01T00:30:00Z');
    }
    if (method === 'crypto') {
      const invoice = calls.find(c => c[0] === 'provider')[1];
      assert.equal(invoice.priceAmount, 23.25);
      assert.equal(new URL(invoice.successUrl).searchParams.get('theme'), 'light');
      assert.equal(new URL(invoice.cancelUrl).searchParams.get('theme'), 'light');
      assert.equal(new URL(invoice.ipnCallbackUrl).searchParams.has('theme'), false);
    }
    if (method === 'card') assert.equal(result.body.paymentUrl, '/api/payments/card/redirect?orderId=fixture-id');
  });
}
for (const method of ['crypto', 'card']) test(method + ': reference write failure never exposes a payment URL', async () => {
  const { route } = createRoute(method, { storageFails: true });
  const result = await route.POST({ headers: new Headers(), nextUrl: new URL('https://example.invalid') });
  assert.equal(result.status, 503);
  assert.equal(result.body.paymentUrl, undefined);
  assert.equal(result.body.invoiceUrl, undefined);
});
test('G2A without a configured purchase link cannot start a dead-end order', async () => {
  const { route, calls } = createRoute('giftcard', { noStore: true });
  assert.equal((await route.POST({ headers: new Headers() })).status, 503);
  assert.equal(calls.length, 0);
});
test('expired card capability cannot redirect to the provider', async () => {
  const route = load('app/api/payments/card/redirect/route.ts', {
    'next/server': next, '@/app/lib/orders.rpc': { getOrderPublic: async () => ({ payment_method: 'card-crypto', status: 'cancelled' }) },
    '@/app/lib/paygate': { buildPaymentUrl: () => { throw Error('Provider must not load'); } },
  });
  assert.equal((await route.GET({ nextUrl: new URL('https://example.invalid?orderId=fixture') })).status, 410);
});
test('pricing waits for precheck and fails closed on verdict lookup failure', async () => {
  const events = [];
  const route = load('app/api/checkout/pricing/route.ts', {
    'next/server': next,
    '@/app/lib/giftcard-backend': { giftcardAvailable: async () => true },
    '@/app/lib/payment-eligibility': { paymentEligibility: async () => { events.push('precheck'); events.push('verdict'); return { error: 'offline' }; } },
    '@/app/lib/client-ip': { getClientIp: () => '127.0.0.1' },
    '@/app/lib/customer-input': { readJsonCapped: async () => ({ planId: '1-month', connections: 1 }), toInternationalPhone: () => null },
    '@/app/config/paymentMethods': { PAYMENT_METHODS: [{ id: 'paypal', enabled: true }] },
    '@/app/lib/plans.server': { getSitePlans: async () => ({ plans: [{ id: '1-month', price: 10 }] }) },
    '@/app/lib/orders.rpc': { paymentDb: { rpc: async () => { events.push('verdict'); return { error: 'offline' }; } } },
  });
  assert.equal((await route.POST({ headers: new Headers() })).status, 503);
  assert.deepEqual(events, ['precheck', 'verdict']);
});
test('receipt failure is queued rather than falsely treated as a provider success', async () => {
  let queued = 0;
  const email = load('app/lib/email.ts', { './checkout-rpc': { checkoutRpc: async () => { queued++; return { error: 'offline' }; } } });
  await email.sendOrderReceipt({ order_number: 123 }, 'PayPal');
  assert.equal(queued, 1);
});

test('G2A uses only the exact canonical site, plan and connection slot', async () => {
  let rows = [{ site_name: 'brand', giftcard_link1: ['https://store.example.invalid/one', '', 'https://store.example.invalid/three'] }];
  let requestedSites;
  const plans = load('app/lib/plans.server.ts', {
    '@supabase/supabase-js': { createClient: () => ({ rpc: async () => ({ data: { site_name: 'brand', giftcard_purchase_url: 'https://store.example.invalid/generic' } }) }) },
    './checkout-rpc': { checkoutRpc: async (_, args) => { requestedSites = args.p_sites; return { data: rows }; } },
    '../data/plans': { getPlans: () => [{ id: '1-month', months: 1 }, { id: '3-month', months: 3 }] },
  });
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', '1-month', 1), 'https://store.example.invalid/one');
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', '1-month', 2), null);
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', '1-month', 3), 'https://store.example.invalid/three');
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', '3-month', 1), null);
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', 'unknown', 1), null);
  assert.equal(JSON.stringify(requestedSites), '["brand"]');
  rows = [{ site_name: 'default', giftcard_link1: ['https://store.example.invalid/wrong-site'] }];
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', '1-month', 1), null);
  rows = [{ site_name: 'brand', giftcard_link1: ['javascript:alert(1)'] }];
  assert.equal(await plans.getGiftcardPurchaseUrl('brand.host', '1-month', 1), null);
});

for (const unavailable of ['purchase-link', 'provider']) test('pricing excludes G2A entirely without ' + unavailable, async () => {
  const route = load('app/api/checkout/pricing/route.ts', {
    'next/server': next,
    '@/app/lib/giftcard-backend': { giftcardAvailable: async () => unavailable !== 'provider' },
    '@/app/lib/payment-eligibility': { paymentEligibility: async () => ({ verdicts: { giftcard: true, crypto: true } }) },
    '@/app/lib/client-ip': { getClientIp: () => '127.0.0.1' },
    '@/app/lib/customer-input': { readJsonCapped: async () => ({ planId: '1-month', connections: 2 }), toInternationalPhone: () => null },
    '@/app/config/paymentMethods': { PAYMENT_METHODS: [{ id: 'giftcard', enabled: true }, { id: 'crypto', enabled: true }] },
    '@/app/lib/plans.server': { getSitePlans: async () => ({ plans: [{ id: '1-month', price: 20 }] }), getGiftcardPurchaseUrl: async () => unavailable === 'purchase-link' ? null : 'https://store.example.invalid' },
    '@/app/lib/orders.rpc': { paymentDb: { rpc: async () => ({ data: { giftcard: true, crypto: true } }) } },
  });
  const result = await route.POST({ headers: new Headers() });
  assert.equal(result.status, 200);
  assert.equal(result.body.allowed.giftcard, false);
  assert.equal(result.body.methods.giftcard, undefined);
  assert.equal(result.body.allowed.crypto, true);
});

const windowCheck = load('app/lib/reconciliation-window.ts');
for (const method of ['crypto', 'card-crypto']) test(method + ': server checks stop exactly one hour after customer expiry', () => {
  const expiry = Date.parse('2030-01-01T12:00:00Z');
  const order = { payment_method: method, status: 'awaiting_payment', session_expires_at: new Date(expiry).toISOString() };
  for (const now of [expiry - 1, expiry, expiry + 3599999]) assert.equal(windowCheck.isReconciliationOpen(order, now), true);
  for (const now of [expiry + 3600000, expiry + 3600001]) assert.equal(windowCheck.isReconciliationOpen(order, now), false);
  for (const status of ['pending', 'completed']) assert.equal(windowCheck.isReconciliationOpen({ ...order, status }, expiry), false);
  for (const value of [null, '', 'invalid']) assert.equal(windowCheck.isReconciliationOpen({ ...order, session_expires_at: value }, expiry), false);
  assert.equal(windowCheck.isReconciliationOpen({ ...order, payment_method: 'paypal' }, expiry), false);
});

for (const method of ['crypto', 'card']) test(method + ': status exposes expired customer session and grace metadata without a payment invoice', async () => {
  const route = load('app/api/payments/' + method + '/status/route.ts', {
    'next/server': next,
    '@/app/lib/orders.rpc': { getOrderPublic: async () => ({
      payment_method: method === 'card' ? 'card-crypto' : 'crypto', status: 'cancelled',
      session_expired: true, reconciliation_pending: true, reconciliation_until: '2030-01-01T13:00:00Z', invoice_id: null,
    }) },
  });
  const result = await route.GET({ nextUrl: new URL('https://example.invalid?orderId=fixture') });
  assert.equal(result.body.status, 'cancelled');
  assert.equal(result.body.sessionExpired, true);
  assert.equal(result.body.reconciliationPending, true);
  assert.equal(result.body.invoiceId, null);
});

test('server reconciliation rejects expired candidates before contacting any provider', async () => {
  let calls = 0;
  const route = load('app/api/cron/reconcile/route.ts', {
    'next/server': next,
    '@/app/lib/reconciliation-window': windowCheck,
    '@/app/lib/runtime-config': { cfg: async () => 'fixture-secret' },
    '@/app/lib/checkout-rpc': { checkoutRpc: async () => ({ data: [{ order_number: 123 }] }) },
    '@/app/lib/orders.rpc': {
      getOrder: async () => ({ order: { payment_method: 'card-crypto', status: 'awaiting_payment', session_expires_at: '2000-01-01', payment_reference: { ipn_token: 'fixture' } } }),
      applyOrderStatus: async () => { calls++; }, updateOrderReference: async () => { calls++; },
    },
    '@/app/lib/nowpayments': { getPaymentStatus: async () => { calls++; }, mapPaymentStatus: () => 'pending' },
    '@/app/lib/paygate': { checkPaygateStatus: async () => { calls++; } },
    '@/app/lib/payment-verification': verification,
  });
  assert.equal((await route.POST({ headers: new Headers({ authorization: 'Bearer fixture-secret' }) })).status, 200);
  assert.equal(calls, 0);
});
const phoneLibrary = require('libphonenumber-js/max');
// Library checks Object identity; move VM-created options into the host realm.
const identity = load('app/lib/payment-identity.ts', { 'libphonenumber-js/max': {
  ...phoneLibrary, parsePhoneNumberFromString: (raw, options) => phoneLibrary.parsePhoneNumberFromString(raw, JSON.parse(JSON.stringify(options))),
} });
test('phone normalization preserves international country, shared +1 and national leading digits', () => {
  for (const [phone, country, key, region] of [
    ['2025550100', 'US', '12025550100', 'US'],
    ['+1 416 555 0100', 'US', '14165550100', 'CA'],
    ['+1 202 555 0100', 'CA', '12025550100', 'US'],
    ['0044 20 7946 0018', 'US', '442079460018', 'GB'],
    ['2025550100', 'CA', '12025550100', 'US'],
  ]) {
    const found = identity.paymentIdentity(phone, country);
    assert.equal(found.phoneKey, key);
    assert.equal(found.phoneCountry, region);
  }
  assert.equal(identity.paymentIdentity('garbage', 'US').phoneKey, null);
  assert.equal(identity.paymentIdentity('+12025550100 ext 123', 'US').phoneKey, null);
  for (const country of ['', 'XX', 'T1', 'USA']) assert.equal(identity.paymentIpCountry(new Headers({ 'cf-ipcountry': country })), null);
  assert.equal(identity.paymentIpCountry(new Headers({ 'cf-ipcountry': 'ca' })), 'CA');
});
test('shared eligibility signs real ingress country and waits for the same normalized WhatsApp key', async () => {
  const calls = [];
  const helper = load('app/lib/payment-eligibility.ts', {
    './payment-identity': identity,
    './client-ip': { getClientIp: () => '192.0.2.1' },
    './checkout-precheck': { ensureCheckoutPrecheck: async (...args) => { calls.push(['precheck', ...args]); } },
    './checkout-rpc': { checkoutRpc: async (action, args) => { calls.push([action, args]); return { data: { paypal: true } }; } },
  });
  const result = await helper.paymentEligibility({ site: 'default', methods: ['paypal'], phone: '+1 202 555 0100', country: 'US', email: ' TEST@EXAMPLE.INVALID ', headers: new Headers({ 'cf-ipcountry': 'CA' }) });
  assert.equal(result.verdicts.paypal, true);
  assert.deepEqual(calls[0], ['precheck', 'default', '12025550100', '192.0.2.1']);
  assert.equal(calls[1][0], 'payment_eligibility_v3');
  assert.equal(calls[1][1].p_ip_country, 'CA');
  assert.equal(calls[1][1].p_declared_country, 'US');
  assert.equal(calls[1][1].p_phone_country, 'US');
  assert.equal(calls[1][1].p_email, 'test@example.invalid');
  await helper.paymentEligibility({ site: 'default', methods: ['paypal'], phone: '2025550100', country: 'US', headers: new Headers() });
  assert.equal(calls.at(-1)[1].p_ip_country, null);
});
test('pricing displays PayPal only after the server allows it and hides a denied verdict', async () => {
  for (const allowed of [true, false]) {
    const route = load('app/api/checkout/pricing/route.ts', {
      'next/server': next,
      '@/app/lib/giftcard-backend': { giftcardAvailable: async () => true },
      '@/app/lib/payment-eligibility': { paymentEligibility: async () => ({ verdicts: { paypal: allowed } }) },
      '@/app/lib/customer-input': { readJsonCapped: async () => ({ planId: '1-month', connections: 1, country: 'US', ipCountry: 'US' }) },
      '@/app/config/paymentMethods': { PAYMENT_METHODS: [{ id: 'paypal', enabled: true }] },
      '@/app/lib/plans.server': { getSitePlans: async () => ({ plans: [{ id: '1-month', price: 10 }] }) },
    });
    const result = await route.POST({ headers: new Headers({ 'cf-ipcountry': 'CA' }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.allowed.paypal, allowed);
  }
});
