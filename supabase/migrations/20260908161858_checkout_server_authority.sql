CREATE OR REPLACE FUNCTION public.create_order(p_token uuid, p_nonce text, p_clearance text, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tok public.payment_tokens%rowtype;
  v_secret text; v_expected text; v_digest_hex text;
  v_id uuid; v_no bigint; v_site text;
  v_prices jsonb; v_price numeric; v_orig numeric; v_off numeric;
  v_method text; v_allowed jsonb;
begin
  update public.payment_tokens set used_at = now()
    where token = p_token and used_at is null and expires_at > now()
    returning * into v_tok;
  if v_tok.token is null then raise exception 'invalid_or_used_token' using errcode='P0001'; end if;

  v_digest_hex := encode(extensions.digest(p_token::text || ':' || coalesce(p_nonce,''), 'sha256'),'hex');
  if left(v_digest_hex, v_tok.difficulty) <> repeat('0', v_tok.difficulty) then
    raise exception 'pow_failed' using errcode='P0001'; end if;

  if v_tok.captcha_required then
    select value into v_secret from public.service_secrets where name='captcha_clearance_hmac';
    if coalesce(v_secret,'')='' then raise exception 'checkout_not_configured'; end if;
    v_expected := encode(extensions.hmac(p_token::text, coalesce(v_secret,''), 'sha256'),'hex');
    if p_clearance is null or p_clearance <> v_expected then
      raise exception 'captcha_required' using errcode='P0001'; end if;
  end if;

  -- Resolve site to an existing row (multi-brand safe) → never an FK violation.
  select site_name into v_site from public.site_settings
    where site_name = p_order->>'site_name' or domain = p_order->>'site_name' limit 1;
  v_site := coalesce(v_site, 'default');

  -- Is this customer allowed on this rail at all?
  v_method := p_order->>'payment_method';
  if v_method is null or v_method not in ('paypal','giftcard','crypto','card-crypto') then raise exception 'invalid_payment_method'; end if;
  if coalesce((p_order->>'connections')::int,0) not between 1 and 5 then raise exception 'invalid_connections'; end if;
  if length(btrim(coalesce(p_order->>'customer_name',''))) not between 4 and 100
     or coalesce(p_order->>'customer_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(p_order->>'customer_email')>254 then raise exception 'invalid_customer'; end if;
  if v_method is not null then
    v_allowed := public.allowed_payment_methods(
      v_site, array[v_method],
      p_order->>'customer_phone_key',            -- international key, when the caller has one
      p_order->>'customer_email',
      p_order->>'customer_country',
      null);                                     -- IP country: route-only, see above
    if (v_allowed->>v_method)::boolean is not true then
      raise exception 'method_not_allowed' using errcode='P0001';
    end if;
  end if;

  -- PRICE AUTHORITY. Any plan_price in p_order is ignored.
  v_prices := public.get_site_plan_prices(
                v_site,
                coalesce((p_order->>'connections')::int, 1),
                v_method);
  select (e->>'original')::numeric, (e->>'amount_off')::numeric, (e->>'final')::numeric
    into v_orig, v_off, v_price
    from jsonb_array_elements(coalesce(v_prices, '[]'::jsonb)) e
   where e->>'plan_id' = p_order->>'plan_id';
  if v_price is null or v_price <= 0 then
    raise exception 'invalid_plan' using errcode='P0001';
  end if;

  insert into public.orders (
    site_name, customer_name, customer_email, customer_phone, customer_country,
    plan_id, plan_name, plan_duration, plan_price, original_price, discount_amount,
    connections, device_type, has_iptv_player, panel_type, payment_method,
    paypal_email, session_expires_at, status
  ) values (
    v_site, p_order->>'customer_name', lower(p_order->>'customer_email'),
    p_order->>'customer_phone', p_order->>'customer_country', p_order->>'plan_id', p_order->>'plan_name',
    p_order->>'plan_duration', v_price, v_orig, v_off,
    coalesce((p_order->>'connections')::int,1),
    p_order->>'device_type', coalesce((p_order->>'has_iptv_player')::boolean,false), p_order->>'panel_type',
    v_method, null, clock_timestamp() + case v_method when 'paypal' then interval '30 minutes' when 'giftcard' then interval '2 hours' when 'card-crypto' then interval '12 hours' when 'crypto' then interval '5 hours' end,
    'awaiting_payment'
  ) returning id, order_number into v_id, v_no;

  return (select jsonb_build_object('id',id,'order_number',order_number,'plan_price',plan_price,'plan_name',plan_name,'plan_id',plan_id,'connections',connections,'payment_method',payment_method,'session_expires_at',session_expires_at) from public.orders where id=v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_order_status(p_order_number bigint, p_status text, p_payment_reference jsonb, p_paypal_txn_id text, p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text; v_expected text; v_o public.orders%rowtype; v_prev text;
  v_order_json jsonb; v_rank_new int; v_rank_prev int; v_allowed boolean;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  if coalesce(v_secret,'')='' then raise exception 'checkout_not_configured'; end if;
  v_expected := encode(extensions.hmac(p_order_number::text || ':' || p_status, coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then raise exception 'bad_clearance' using errcode='P0001'; end if;

  select * into v_o from public.orders where order_number = p_order_number for update;
  if v_o.order_number is null then raise exception 'order_not_found' using errcode='P0001'; end if;
  v_prev := v_o.status;
  if p_status not in ('processing','pending','cancelled') then raise exception 'invalid_gateway_status'; end if;

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
    v_allowed := v_prev = 'awaiting_payment';   -- a PAID 'pending' order is off-limits
  else
    v_allowed := (v_prev = 'cancelled') or (v_rank_new > v_rank_prev);
  end if;

  if not v_allowed then
    -- A later provider event can add its verified reference without downgrading
    -- a pending/processing order or sending a duplicate receipt.
    if p_payment_reference is not null and v_prev in ('pending','processing') and p_status in ('pending','processing') then
      update public.orders set payment_reference=coalesce(payment_reference,'{}'::jsonb)||p_payment_reference where id=v_o.id;
    end if;
    return jsonb_build_object('applied', false, 'previous_status', v_prev, 'status', v_prev, 'order', v_order_json);
  end if;

  update public.orders
    set status = p_status,
        payment_reference = coalesce(payment_reference,'{}'::jsonb) || coalesce(p_payment_reference,'{}'::jsonb),
        paypal_txn_id = coalesce(p_paypal_txn_id, paypal_txn_id),
        updated_at = now()
    where order_number = p_order_number;

  if p_status = 'cancelled' and v_o.payment_method = 'paypal' then
    perform public.release_paypal_account(v_o.paypal_email, v_o.order_number);
  end if;

  return jsonb_build_object('applied', true, 'previous_status', v_prev, 'status', p_status, 'order', v_order_json);
end;
$function$;


CREATE OR REPLACE FUNCTION public.confirm_paypal_order(p_order_id uuid, p_txn_id text, p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_secret text; v_expected text; v_o public.orders%rowtype;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  if coalesce(v_secret,'')='' then raise exception 'checkout_not_configured'; end if;
  v_expected := encode(extensions.hmac(p_order_id::text, coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then raise exception 'bad_clearance' using errcode='P0001'; end if;

  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then raise exception 'order_not_found' using errcode='P0001'; end if;
  if v_o.payment_method <> 'paypal' then raise exception 'wrong_payment_method'; end if;
  if length(coalesce(p_txn_id,''))>100 then raise exception 'invalid_transaction_id'; end if;

  if v_o.status='awaiting_payment' and (v_o.session_expires_at is null or v_o.session_expires_at<=clock_timestamp()) then
    update public.orders set status='cancelled',updated_at=now() where id=v_o.id;
    if v_o.payment_method='paypal' then perform public.release_paypal_account(v_o.paypal_email,v_o.order_number); end if;
    return jsonb_build_object('confirmed',false,'cancelled',true,'status','cancelled','order_number',v_o.order_number);
  end if;
  if v_o.status <> 'awaiting_payment' then
    return jsonb_build_object('confirmed', false, 'status', v_o.status);
  end if;

  update public.orders
    set status = 'pending', paypal_txn_id = nullif(p_txn_id,''), updated_at = now()
    where id = p_order_id and status = 'awaiting_payment';

  return jsonb_build_object('confirmed', true, 'order', jsonb_build_object(
    'order_number', v_o.order_number, 'id', v_o.id, 'site_name', v_o.site_name,
    'customer_email', v_o.customer_email, 'customer_name', v_o.customer_name,
    'plan_name', v_o.plan_name, 'plan_duration', v_o.plan_duration, 'plan_price', v_o.plan_price,
    'connections', v_o.connections, 'device_type', v_o.device_type,
    'payment_method', v_o.payment_method, 'created_at', v_o.created_at));
end;
$function$;


CREATE OR REPLACE FUNCTION public.submit_manual_payment(p_order_id uuid, p_reference jsonb, p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_secret text; v_expected text; v_o public.orders%rowtype;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  if coalesce(v_secret,'')='' then raise exception 'checkout_not_configured'; end if;
  v_expected := encode(extensions.hmac(p_order_id::text, coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then raise exception 'bad_clearance' using errcode='P0001'; end if;

  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then raise exception 'order_not_found' using errcode='P0001'; end if;
  if v_o.payment_method <> 'giftcard' then raise exception 'wrong_payment_method'; end if;
  if coalesce(p_reference->>'giftcard_code','') !~ '^[A-Z0-9]{16,19}$' then raise exception 'invalid_giftcard_code'; end if;
  if v_o.status='awaiting_payment' and (v_o.session_expires_at is null or v_o.session_expires_at<=clock_timestamp()) then
    update public.orders set status='cancelled',updated_at=now() where id=v_o.id;
    return jsonb_build_object('confirmed',false,'status','cancelled');
  end if;
  if v_o.status <> 'awaiting_payment' then
    return jsonb_build_object('confirmed', false, 'status', v_o.status);
  end if;

  update public.orders
    set status = 'pending',
        payment_reference = coalesce(payment_reference, '{}'::jsonb) || jsonb_build_object('giftcard_code',p_reference->>'giftcard_code'),
        updated_at = now()
    where id = p_order_id and status = 'awaiting_payment';

  return jsonb_build_object('confirmed', true, 'order', jsonb_build_object(
    'order_number', v_o.order_number, 'id', v_o.id, 'site_name', v_o.site_name,
    'customer_email', v_o.customer_email, 'customer_name', v_o.customer_name,
    'plan_name', v_o.plan_name, 'plan_duration', v_o.plan_duration, 'plan_price', v_o.plan_price,
    'connections', v_o.connections, 'device_type', v_o.device_type,
    'payment_method', v_o.payment_method, 'created_at', v_o.created_at));
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_secret text; v_expected text; v_o public.orders%rowtype;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  if coalesce(v_secret,'')='' then raise exception 'checkout_not_configured'; end if;
  v_expected := encode(extensions.hmac(p_order_id::text, coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then raise exception 'bad_clearance' using errcode='P0001'; end if;

  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then raise exception 'order_not_found' using errcode='P0001'; end if;

  if v_o.status <> 'awaiting_payment' then
    return jsonb_build_object('cancelled', false, 'status', v_o.status, 'order_number', v_o.order_number);
  end if;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  if v_o.payment_method = 'paypal' then perform public.release_paypal_account(v_o.paypal_email, v_o.order_number); end if;
  return jsonb_build_object('cancelled', true, 'status', 'cancelled', 'order_number', v_o.order_number);
end;
$function$;


CREATE OR REPLACE FUNCTION public.assign_paypal_account(p_order_id uuid, p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text; v_expected text; v_o public.orders%rowtype; v_chosen record;
  v_today timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  if coalesce(v_secret,'')='' then raise exception 'checkout_not_configured'; end if;
  v_expected := encode(extensions.hmac(p_order_id::text, coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then raise exception 'bad_clearance' using errcode='P0001'; end if;

  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then raise exception 'order_not_found' using errcode='P0001'; end if;
  if v_o.payment_method <> 'paypal' or v_o.status <> 'awaiting_payment' then
    raise exception 'invalid_order_state' using errcode='P0001'; end if;

  if v_o.session_expires_at<=clock_timestamp() then raise exception 'session_expired'; end if;
  if v_o.paypal_email is not null then return jsonb_build_object('paypal_email',v_o.paypal_email); end if;
  perform pg_advisory_xact_lock(hashtext('checkout:paypal:assignment'));
  select s.id, s.email into v_chosen from (
    select a.id, a.email, a.last_used_at,
      (select count(*) from public.orders o
         where o.order_number = any (coalesce(a.order_ids,'{}')::bigint[])
           and o.status in ('pending','awaiting_payment')) as pending_count,
      (select count(*) from public.orders o
         where o.order_number = any (coalesce(a.order_ids,'{}')::bigint[])
           and o.status = 'completed' and o.updated_at >= v_today) as completed_today
    from public.paypal_accounts a
    where a.active = true
  ) s
  order by (case when s.completed_today < 2 then 0 else 1 end),  -- daily-limit eligible first
           s.pending_count asc, s.completed_today asc, s.last_used_at asc nulls first
  limit 1;

  if v_chosen.id is null then
    return jsonb_build_object('paypal_email', null);
  end if;

  update public.paypal_accounts
    set order_ids = array_append(coalesce(order_ids,'{}'), v_o.order_number::text),
        last_used_at = now()
    where id = v_chosen.id;
  update public.orders set paypal_email = v_chosen.email, updated_at = now() where id = p_order_id;

  return jsonb_build_object('paypal_email', v_chosen.email);
end;
$function$;


CREATE OR REPLACE FUNCTION public.release_paypal_account(p_email text, p_order_number bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_acc record; v_cleaned text[]; v_has_active boolean;
begin
  if p_email is null then return; end if;
  select id, order_ids into v_acc from public.paypal_accounts where email = p_email limit 1 for update;
  if not found then return; end if;
  v_cleaned := array(select x from unnest(coalesce(v_acc.order_ids,'{}')) x where x <> p_order_number::text);
  v_has_active := exists (
    select 1 from public.orders
    where order_number = any (select y::bigint from unnest(v_cleaned) y)
      and status in ('awaiting_payment','pending','processing'));
  update public.paypal_accounts
    set order_ids = v_cleaned,
        last_used_at = case when v_has_active then last_used_at else null end
    where id = v_acc.id;
end;
$function$;


create or replace function public.get_checkout_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then return null; end if;
 if o.status='awaiting_payment' and (o.session_expires_at is null or o.session_expires_at<=clock_timestamp()) then
   update public.orders set status='cancelled',updated_at=now() where id=o.id;
   if o.payment_method='paypal' then perform public.release_paypal_account(o.paypal_email,o.order_number); end if;
   o.status:='cancelled';
 end if;
 return public.get_order_public(p_order_id) || jsonb_build_object('plan_id',o.plan_id,'server_now',clock_timestamp());
end $$;
revoke all on function public.get_checkout_order(uuid) from public,anon,authenticated;

-- All externally callable operations are signed by the Next.js server using
-- an action/payload-bound HMAC. No server/service-role key is bundled in JS.
create or replace function public.checkout_dispatch(p_action text,p_payload text,p_clearance text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s text; p jsonb; r jsonb; n bigint;
begin
 select value into s from public.service_secrets where name='order_update_hmac';
 if coalesce(s,'')='' or length(coalesce(p_payload,''))>32768 or p_clearance is null or
 p_clearance<>encode(extensions.hmac(p_action||':'||p_payload,s,'sha256'),'hex') then
   raise exception 'bad_clearance';
 end if;
 p:=p_payload::jsonb;
 perform set_config('checkout.server_v2','1',true);
 case p_action
 when 'create_order' then
   return public.create_order((p->>'p_token')::uuid,p->>'p_nonce',p->>'p_clearance',p->'p_order');
 when 'issue_payment_challenge' then
   return public.issue_payment_challenge(p->>'p_issued_ip',coalesce((p->>'p_captcha_verifiable')::boolean,false))::jsonb;
 when 'precheck_cached' then return public.precheck_cached(p->>'p_site',p->>'p_phone');
 when 'precheck_record' then
   perform public.precheck_record(p->>'p_site',p->>'p_phone',(p->>'p_has_whatsapp')::boolean,p->>'p_jid',p->>'p_error',p->>'p_ip');
   return 'null'::jsonb;
 when 'get_order_public' then return public.get_checkout_order((p->>'p_order_id')::uuid);
 when 'get_order' then return public.get_order((p->>'p_order_number')::bigint,p->>'p_clearance');
 when 'update_order_reference' then
   perform public.update_order_reference((p->>'p_order_number')::bigint,nullif(p->'p_payment_reference','null'::jsonb),p->>'p_paypal_email',p->>'p_clearance');
   return 'null'::jsonb;
 when 'apply_order_status' then
   return public.apply_order_status((p->>'p_order_number')::bigint,p->>'p_status',nullif(p->'p_payment_reference','null'::jsonb),p->>'p_paypal_txn_id',p->>'p_clearance');
 when 'assign_paypal_account' then return public.assign_paypal_account((p->>'p_order_id')::uuid,p->>'p_clearance');
 when 'confirm_paypal_order' then return public.confirm_paypal_order((p->>'p_order_id')::uuid,p->>'p_txn_id',p->>'p_clearance');
 when 'submit_manual_payment' then return public.submit_manual_payment((p->>'p_order_id')::uuid,nullif(p->'p_reference','null'::jsonb),p->>'p_clearance');
 when 'cancel_order' then return public.cancel_order((p->>'p_order_id')::uuid,p->>'p_clearance');
 when 'save_paypal_txn' then
   r:=public.get_checkout_order((p->>'p_order_id')::uuid);
   if r is null or r->>'payment_method'<>'paypal' or r->>'status' not in ('awaiting_payment','pending') then raise exception 'invalid_order_state'; end if;
   if length(coalesce(p->>'p_txn_id',''))>100 then raise exception 'invalid_transaction_id'; end if;
   return public.save_paypal_txn((p->>'p_order_id')::uuid,p->>'p_txn_id',p->>'p_clearance');
 when 'list_expired_orders' then return public.list_expired_orders(p->>'p_clearance');
 when 'giftcard_links' then
   return coalesce((select jsonb_agg(x) from (select site_name,giftcard_link1,giftcard_link2,giftcard_link3,giftcard_link4 from public.pricing where site_name in (select jsonb_array_elements_text(p->'p_sites'))) x),'[]'::jsonb);
 when 'reconciliation_orders' then
   return coalesce((select jsonb_agg(x) from (select id,order_number from public.orders
    where payment_method in ('crypto','card-crypto') and status in ('awaiting_payment','processing','cancelled')
      and created_at>now()-interval '7 days' order by coalesce(payment_reference->>'last_checked_at','') asc, updated_at limit 12) x),'[]'::jsonb);
 when 'queue_receipt' then
   n:=(p->>'order_number')::bigint;
   insert into public.checkout_receipts(order_number) select order_number from public.orders
   where order_number=n and status in ('pending','completed') on conflict do nothing;
   return 'true'::jsonb;
 else raise exception 'unknown_checkout_action';
 end case;
end $$;
revoke all on function public.checkout_dispatch(text,text,text) from public,anon,authenticated;
grant execute on function public.checkout_dispatch(text,text,text) to anon,service_role;

-- Durable receipt outbox. No customer can claim or suppress an email.
create table if not exists public.checkout_receipts(
 order_number bigint primary key references public.orders(order_number) on delete cascade,
 status text not null default 'queued' check(status in ('queued','sending','sent','needs_review')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, request_body jsonb, provider_id text,
 first_attempt_at timestamptz, last_error text, created_at timestamptz not null default now()
);
alter table public.checkout_receipts enable row level security;
revoke all on public.checkout_receipts from public,anon,authenticated;
grant all on public.checkout_receipts to service_role;
create index if not exists checkout_receipts_due on public.checkout_receipts(next_attempt_at) where status in ('queued','sending');
create or replace function public.queue_checkout_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' and old.status is distinct from new.status and current_setting('checkout.server_v2',true)='1' then
   insert into public.checkout_receipts(order_number) values(new.order_number) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.queue_checkout_receipt() from public,anon,authenticated;
drop trigger if exists checkout_receipt_outbox on public.orders;
create trigger checkout_receipt_outbox after update of status on public.orders for each row execute function public.queue_checkout_receipt();

create or replace function public.claim_checkout_receipt() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.checkout_receipts%rowtype;
begin
 update public.checkout_receipts set status='needs_review',last_error='Retry window exhausted'
 where status in ('queued','sending') and (attempts>=6 or first_attempt_at<now()-interval '22 hours')
 and (lease_until is null or lease_until<now());
 select * into r from public.checkout_receipts where
 (status='queued' or (status='sending' and lease_until<now()))
 and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 1;
 if not found then return null; end if;
 if r.attempts=0 and not public.claim_receipt_email(
   (select site_name from public.orders where order_number=r.order_number),
   (select customer_email from public.orders where order_number=r.order_number),r.order_number) then
   update public.checkout_receipts set next_attempt_at=now()+interval '15 minutes' where order_number=r.order_number;
   return null;
 end if;
 update public.checkout_receipts set status='sending',attempts=attempts+1,
 first_attempt_at=coalesce(first_attempt_at,now()),lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where order_number=r.order_number returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.claim_checkout_receipt() from public,anon,authenticated;
grant execute on function public.claim_checkout_receipt() to service_role;

-- References are merged atomically; a missing order must never look successful.
create or replace function public.update_order_reference(p_order_number bigint,p_payment_reference jsonb,p_paypal_email text,p_clearance text)
returns void language plpgsql security definer set search_path='' as $ref$
declare s text;
begin
 select value into s from public.service_secrets where name='order_update_hmac';
 if coalesce(s,'')='' or p_clearance is null or p_clearance<>encode(extensions.hmac(p_order_number::text,s,'sha256'),'hex') then raise exception 'bad_clearance'; end if;
 if p_payment_reference is not null and jsonb_typeof(p_payment_reference)<>'object' then raise exception 'invalid_reference'; end if;
 update public.orders set payment_reference=coalesce(payment_reference,'{}'::jsonb)||coalesce(p_payment_reference,'{}'::jsonb),
   updated_at=now() where order_number=p_order_number;
 if not found then raise exception 'order_not_found'; end if;
end $ref$;

-- Keep SQL clearance checks aligned with keys edited in the existing dashboard.
create or replace function public.sync_checkout_hmac_secret() returns trigger
language plpgsql security definer set search_path='' as $sync$
begin
 if new.key in ('ORDER_UPDATE_HMAC','CAPTCHA_CLEARANCE_HMAC') then
   if length(coalesce(new.value,''))<32 then raise exception 'Checkout HMAC secrets require at least 32 characters'; end if;
   insert into public.service_secrets(name,value) values(lower(new.key),new.value)
   on conflict(name) do update set value=excluded.value;
 end if;
 return new;
end $sync$;
revoke all on function public.sync_checkout_hmac_secret() from public,anon,authenticated;
drop trigger if exists sync_checkout_hmac on public.app_secrets;
create trigger sync_checkout_hmac after insert or update of value on public.app_secrets
 for each row execute function public.sync_checkout_hmac_secret();
insert into public.app_secrets(key,value,category,description,is_secret)
values('GATEWAY_CHECKOUT_URL','https://checkout.layerseventv.cc','gateway','Checkout server origin for VPS payment reconciliation',false)
on conflict(key) do nothing;
