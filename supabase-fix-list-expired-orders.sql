-- ═════════════════════════════════════════════════════════════════════════
-- CRYPTO/LIFECYCLE AUDIT FIXES  —  apply on Supabase project gofcbtdoltfnawmlpmeo
-- (Supabase MCP execute_sql, or the SQL editor). Idempotent; safe to re-run.
--
-- Invariant being enforced:  once a payment is RECEIVED (status='pending') the
-- order can ONLY be moved by the admin (to 'completed'). No scheduler, no anon
-- RPC, and no stray/late provider IPN may ever auto-cancel a paid order.
-- Only genuinely-unpaid ('awaiting_payment') — or still-settling ('processing',
-- which a failed/expired IPN may drop) — orders can be cancelled.
--
-- After applying, verify none of these bodies still reference 'pending' in a
-- cancellation predicate:
--   select proname, prosrc from pg_proc
--   where proname in ('cron_cancel_expired_orders','list_expired_orders','apply_order_status','cancel_order');
-- ═════════════════════════════════════════════════════════════════════════

-- 1) HTTP-backup cron source: only awaiting_payment may expire (never pending/processing).
CREATE OR REPLACE FUNCTION public.list_expired_orders(p_clearance text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_secret text; v_expected text; v_rows jsonb;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  v_expected := encode(extensions.hmac('cron:expired', coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then
    raise exception 'bad_clearance' using errcode='P0001'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('order_number', order_number, 'id', id, 'payment_method', payment_method)), '[]'::jsonb)
    into v_rows
    from public.orders
    where status = 'awaiting_payment'
      and session_expires_at is not null
      and session_expires_at < now();
  return v_rows;
end;
$function$;

-- 2) Primary pg_cron job: DIRECT UPDATE, so it must filter awaiting_payment itself.
--    (Deployed body already does this — re-asserted here so this file is authoritative.)
CREATE OR REPLACE FUNCTION public.cron_cancel_expired_orders()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select order_number, payment_method, paypal_email
      from public.orders
     where status = 'awaiting_payment'
       and session_expires_at is not null
       and session_expires_at < now()
     for update skip locked
  loop
    update public.orders set status = 'cancelled', updated_at = now()
      where order_number = r.order_number;
    if r.payment_method = 'paypal' then
      perform public.release_paypal_account(r.paypal_email, r.order_number);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- 3) State-machine guard (defense-in-depth for EVERY apply_order_status caller —
--    webhooks, HTTP-backup cron, rollbacks). Cancel is now allowed ONLY from
--    'awaiting_payment' or 'processing'. A stray failed/expired/refunded IPN, or
--    a buggy caller, can NEVER cancel a paid 'pending' order.
CREATE OR REPLACE FUNCTION public.apply_order_status(
  p_order_number bigint, p_status text, p_payment_reference jsonb, p_paypal_txn_id text, p_clearance text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_secret text; v_expected text; v_o public.orders%rowtype; v_prev text;
  v_order_json jsonb; v_rank_new int; v_rank_prev int; v_allowed boolean;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  v_expected := encode(extensions.hmac(p_order_number::text || ':' || p_status, coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then
    raise exception 'bad_clearance' using errcode='P0001'; end if;

  select * into v_o from public.orders where order_number = p_order_number;
  if v_o.order_number is null then raise exception 'order_not_found' using errcode='P0001'; end if;
  v_prev := v_o.status;

  v_order_json := jsonb_build_object(
    'order_number', v_o.order_number, 'id', v_o.id, 'site_name', v_o.site_name,
    'customer_email', v_o.customer_email, 'customer_name', v_o.customer_name,
    'plan_name', v_o.plan_name, 'plan_duration', v_o.plan_duration, 'plan_price', v_o.plan_price,
    'connections', v_o.connections, 'device_type', v_o.device_type,
    'payment_method', v_o.payment_method, 'created_at', v_o.created_at);

  v_rank_new  := case p_status when 'awaiting_payment' then 1 when 'processing' then 2 when 'pending' then 3 when 'completed' then 4 else 0 end;
  v_rank_prev := case v_prev    when 'awaiting_payment' then 1 when 'processing' then 2 when 'pending' then 3 when 'completed' then 4 else 0 end;

  if v_prev = 'completed' then
    return jsonb_build_object('applied', false, 'previous_status', v_prev, 'status', v_prev, 'order', v_order_json);
  end if;

  if p_status = 'cancelled' then
    -- Only an unpaid / still-settling order may be cancelled. A PAID ('pending')
    -- order is off-limits to every automated/anon path — admin completion only.
    v_allowed := v_prev in ('awaiting_payment','processing');
  else
    v_allowed := (v_prev = 'cancelled') or (v_rank_new > v_rank_prev);
  end if;

  if not v_allowed then
    return jsonb_build_object('applied', false, 'previous_status', v_prev, 'status', v_prev, 'order', v_order_json);
  end if;

  update public.orders
    set status = p_status,
        payment_reference = coalesce(p_payment_reference, payment_reference),
        paypal_txn_id = coalesce(p_paypal_txn_id, paypal_txn_id),
        updated_at = now()
    where order_number = p_order_number;

  if p_status = 'cancelled' and v_o.payment_method = 'paypal' then
    perform public.release_paypal_account(v_o.paypal_email, v_o.order_number);
  end if;

  return jsonb_build_object('applied', true, 'previous_status', v_prev, 'status', p_status, 'order', v_order_json);
end;
$function$;

-- 4) cancel_order (customer-facing, UUID capability): restrict to awaiting_payment
--    only. NOTE: paste the CURRENT deployed body and change ONLY the status guard
--    to the line below (keep the clearance check + paypal-slot release intact):
--        if v_o.status <> 'awaiting_payment' then
--          return jsonb_build_object('cancelled', false, 'status', v_o.status);
--        end if;
--    (Left as a documented manual edit because the exact body must be read live
--    first — do it in the same session that applies 1–3.)
