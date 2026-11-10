-- ============================================================================
-- PAYMENT-GATEWAY — Per-site checkout customization migration
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor (safe to re-run: everything is
-- IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- What it adds — all keyed by the same `site_name` used in `site_settings`,
-- so ONE deployment on Coolify serves every domain and each brand gets its
-- own identity, plans, currency, language and coupons:
--
--   1. site_settings  → logo_url, currency, default_language
--   2. orders         → coupon_code, discount_amount, currency
--   3. site_plans     → per-brand plan catalogue & prices (replaces the
--                       hardcoded plans; missing rows fall back to the code)
--   4. coupons        → per-brand (or global) discount codes
--
-- The checkout code is fully backward-compatible: if this migration hasn't
-- run yet, everything behaves exactly as before.
-- ============================================================================


-- ── 1. site_settings: brand identity + locale ──────────────────────────────
-- logo_url         : shown in the checkout header and used as the favicon
-- currency         : ISO code the brand charges/displays in (USD, EUR, ...)
-- default_language : checkout UI language (en / fr / es / de / ar);
--                    can still be overridden per link with ?lang=xx

alter table public.site_settings add column if not exists logo_url text;
alter table public.site_settings add column if not exists currency text not null default 'USD';
alter table public.site_settings add column if not exists default_language text not null default 'en';


-- ── 2. orders: coupon + currency audit trail ────────────────────────────────
-- plan_price remains the FINAL charged amount (so dashboard revenue stays
-- correct); coupon_code/discount_amount record what was deducted.

alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_amount numeric(10,2);
alter table public.orders add column if not exists currency text not null default 'USD';


-- ── 3. site_plans: per-brand plan catalogue ─────────────────────────────────
-- One row per (brand, plan). `prices` maps connection count → price:
--   {"1": 12.00, "2": 25.00, "3": 30.00, "4": 39.00, "5": 45.00}
-- Resolution in the checkout:
--   rows for the brand → rows for 'Default' → hardcoded code plans.
-- So you can give ONE brand special pricing and let the rest share 'Default'.

create table if not exists public.site_plans (
    id              uuid primary key default gen_random_uuid(),
    site_name       text not null default 'Default',
    plan_id         text not null,               -- stable id used in checkout URLs (?plan=6-months)
    name            text not null,               -- display name (Starter, Premium, ...)
    duration_months integer not null check (duration_months >= 1),
    features        jsonb not null default '[]'::jsonb,
    popular         boolean not null default false,
    prices          jsonb not null,              -- {"1": 12.00, ..., "5": 45.00}
    sort_order      integer not null default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (site_name, plan_id)
);

create index if not exists idx_site_plans_site on public.site_plans (site_name);

-- Only the server (service-role key) reads this table; block anonymous access.
alter table public.site_plans enable row level security;

-- keep updated_at fresh on edits
create or replace function public.set_site_plans_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists trg_site_plans_updated_at on public.site_plans;
create trigger trg_site_plans_updated_at
    before update on public.site_plans
    for each row execute function public.set_site_plans_updated_at();

-- Seed the 'Default' catalogue with the exact plans/prices that were
-- hardcoded in the app until now — zero behavior change on day one.
insert into public.site_plans (site_name, plan_id, name, duration_months, features, popular, prices, sort_order)
values
    ('Default', '1-month',   'Starter',  1,
     '["Full HD & 4K Streaming","All Channels Included","24/7 Support","VOD Library Access"]'::jsonb,
     false, '{"1": 12.00, "2": 25.00, "3": 30.00, "4": 39.00, "5": 45.00}'::jsonb, 1),
    ('Default', '3-months',  'Standard', 3,
     '["Full HD & 4K Streaming","All Channels Included","24/7 Priority Support","VOD Library Access"]'::jsonb,
     false, '{"1": 25.00, "2": 45.00, "3": 60.00, "4": 75.00, "5": 85.00}'::jsonb, 2),
    ('Default', '6-months',  'Premium',  6,
     '["Full HD & 4K Streaming","All Channels Included","24/7 Priority Support","VOD Library Access","Catch-Up TV"]'::jsonb,
     true,  '{"1": 45.00, "2": 69.00, "3": 85.00, "4": 110.00, "5": 125.00}'::jsonb, 3),
    ('Default', '12-months', 'Ultimate', 12,
     '["Full HD & 4K Streaming","All Channels Included","24/7 VIP Support","VOD Library Access","Catch-Up TV","Multi-Screen Support"]'::jsonb,
     false, '{"1": 69.00, "2": 90.00, "3": 120.00, "4": 145.00, "5": 170.00}'::jsonb, 4)
on conflict (site_name, plan_id) do nothing;


-- ── 4. coupons: per-brand (or global) discount codes ────────────────────────
-- site_name NULL or 'Default'  → the code works on EVERY brand
-- site_name 'mybrand.com'      → the code only works on that brand
-- discount_type 'percent'      → discount_value is a percentage (e.g. 20)
-- discount_type 'fixed'        → discount_value is an amount (e.g. 5.00)
-- max_uses NULL                → unlimited; expires_at NULL → never expires

create table if not exists public.coupons (
    id             uuid primary key default gen_random_uuid(),
    site_name      text,                          -- null/'Default' = all brands
    code           text not null,
    discount_type  text not null check (discount_type in ('percent', 'fixed')),
    discount_value numeric(10,2) not null check (discount_value > 0),
    min_amount     numeric(10,2) not null default 0,
    max_uses       integer,                       -- null = unlimited
    used_count     integer not null default 0,
    expires_at     timestamptz,                   -- null = never
    is_active      boolean not null default true,
    created_at     timestamptz not null default now()
);

-- A code must be unique within its scope (global or per brand).
create unique index if not exists idx_coupons_code_scope
    on public.coupons (lower(code), coalesce(lower(site_name), ''));

-- Only the server (service-role key) reads this table; block anonymous access.
alter table public.coupons enable row level security;


-- ============================================================================
-- USAGE EXAMPLES (copy, edit, run — not executed by this migration)
-- ============================================================================
--
-- ► Give a brand its own identity (checkout.mybrand.com):
--
--   update public.site_settings
--      set logo_url         = 'https://xyz.supabase.co/storage/v1/object/public/logos/mybrand.png',
--          currency         = 'EUR',
--          default_language = 'fr'
--    where site_name = 'mybrand.com';
--
-- ► Give a brand its own pricing (copy the Default rows, then edit):
--
--   insert into public.site_plans (site_name, plan_id, name, duration_months, features, popular, prices, sort_order)
--   select 'mybrand.com', plan_id, name, duration_months, features, popular, prices, sort_order
--     from public.site_plans where site_name = 'Default'
--   on conflict (site_name, plan_id) do nothing;
--
--   update public.site_plans
--      set prices = '{"1": 15.00, "2": 28.00, "3": 35.00, "4": 45.00, "5": 52.00}'::jsonb
--    where site_name = 'mybrand.com' and plan_id = '1-month';
--
-- ► Create a 20% welcome coupon for every brand (max 100 uses):
--
--   insert into public.coupons (site_name, code, discount_type, discount_value, max_uses)
--   values (null, 'WELCOME20', 'percent', 20, 100);
--
-- ► Create a $5 coupon only for one brand, valid until end of month:
--
--   insert into public.coupons (site_name, code, discount_type, discount_value, expires_at)
--   values ('mybrand.com', 'SAVE5', 'fixed', 5.00, date_trunc('month', now()) + interval '1 month');
--
-- ============================================================================
