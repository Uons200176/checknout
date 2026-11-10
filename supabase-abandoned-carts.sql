-- ============================================================================
-- PAYMENT-GATEWAY — Abandoned-cart email recovery migration
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor (safe to re-run: everything is
-- IF NOT EXISTS). Run it in addition to supabase-checkout-customization.sql.
--
-- How the feature works (email only — no WhatsApp):
--
--   1. When a customer finishes checkout step 1 (email known), the client
--      pings /api/carts/track → a row appears here with status 'open'.
--   2. When they actually create an order, the payment routes mark the row
--      'converted' and link the order_id.
--   3. The cron endpoint /api/cron/abandoned-carts (schedule it every
--      15–30 min, protected by CRON_SECRET like cancel-expired) sends
--      AT MOST ONE localized, brand-styled recovery email per cart:
--        • 'open' carts inactive > ABANDONED_CART_DELAY_MINUTES (default 45)
--        • 'converted' carts whose order never completed (link has &retry=1)
--      Customers with a completed order are never emailed.
--
--   Sender identity comes from site_settings per brand:
--     resend_api_key, resend_email, resend_reply, display_name, logo_url,
--     theme_accent_color, default_language, support_email.
--   Brands without a Resend config are skipped safely.
-- ============================================================================

create table if not exists public.abandoned_carts (
    id                      uuid primary key default gen_random_uuid(),
    website                 text,                       -- host-derived brand domain (e.g. 'mybrand.com')
    customer_email          text not null,              -- stored lowercase
    customer_name           text,
    customer_phone          text,
    customer_country        text,
    plan_id                 text,
    plan_name               text,
    plan_price              numeric(10,2),
    duration_months         integer,
    connections             integer not null default 1,
    currency                text not null default 'USD',
    lang                    text not null default 'en',
    status                  text not null default 'open'
                            check (status in ('open','emailed','converted','completed','skipped')),
    order_id                uuid,                       -- linked order once converted
    recovery_email_sent_at  timestamptz,                -- set once; guarantees max ONE email
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists idx_abandoned_carts_status
    on public.abandoned_carts (status, updated_at);
create index if not exists idx_abandoned_carts_site_email
    on public.abandoned_carts (website, customer_email);

-- Only the server (service-role key) touches this table; block anonymous access.
alter table public.abandoned_carts enable row level security;

-- keep updated_at fresh on edits (it doubles as the "last activity" timestamp)
create or replace function public.set_abandoned_carts_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists trg_abandoned_carts_updated_at on public.abandoned_carts;
create trigger trg_abandoned_carts_updated_at
    before update on public.abandoned_carts
    for each row execute function public.set_abandoned_carts_updated_at();

-- ============================================================================
-- OPTIONAL housekeeping (copy & run manually if you ever want to purge):
--   delete from public.abandoned_carts where created_at < now() - interval '90 days';
-- ============================================================================
