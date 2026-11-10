-- Customer capabilities expire on time; server reconciliation lasts one extra hour.
-- Preserve function ACLs and the signed dispatcher. Does not apply the separate RPC cutover.
CREATE OR REPLACE FUNCTION public.checkout_dispatch(p_action text, p_payload text, p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text; p jsonb; r jsonb; n bigint;
begin
 select value into s from public.service_secrets where name='order_update_hmac';
 if p_action is null or p_payload is null or coalesce(s,'')='' or length(p_payload)>32768 or p_clearance is null or
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
      and session_expires_at is not null and session_expires_at + interval '1 hour' > clock_timestamp() order by coalesce(payment_reference->>'last_checked_at','') asc, updated_at limit 12) x),'[]'::jsonb);
 when 'queue_receipt' then
   n:=(p->>'order_number')::bigint;
   insert into public.checkout_receipts(order_number) select order_number from public.orders
   where order_number=n and status in ('pending','completed') on conflict do nothing;
   return 'true'::jsonb;
 else raise exception 'unknown_checkout_action';
 end case;
end $function$;

CREATE OR REPLACE FUNCTION public.cron_cancel_expired_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select order_number, payment_method, paypal_email from public.orders
     where status = 'awaiting_payment' and session_expires_at is not null and (session_expires_at + case when payment_method in ('crypto','card-crypto') then interval '1 hour' else interval '0' end) <= clock_timestamp()
     for update skip locked
  loop
    update public.orders set status = 'cancelled', updated_at = now() where order_number = r.order_number;
    if r.payment_method = 'paypal' then perform public.release_paypal_account(r.paypal_email, r.order_number); end if;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_expired_orders(p_clearance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_secret text; v_expected text; v_rows jsonb;
begin
  select value into v_secret from public.service_secrets where name='order_update_hmac';
  v_expected := encode(extensions.hmac('cron:expired', coalesce(v_secret,''), 'sha256'),'hex');
  if p_clearance is null or p_clearance <> v_expected then raise exception 'bad_clearance' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('order_number', order_number, 'id', id, 'payment_method', payment_method)), '[]'::jsonb)
    into v_rows from public.orders
    where status = 'awaiting_payment' and session_expires_at is not null and (session_expires_at + case when payment_method in ('crypto','card-crypto') then interval '1 hour' else interval '0' end) <= clock_timestamp();
  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_checkout_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare o public.orders%rowtype; expired boolean; until_at timestamptz; checking boolean;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then return null; end if;
 expired:=o.session_expires_at is null or o.session_expires_at<=clock_timestamp();
 until_at:=o.session_expires_at + case when o.payment_method in ('crypto','card-crypto') then interval '1 hour' else interval '0' end;
 if o.status='awaiting_payment' and (until_at is null or until_at<=clock_timestamp()) then
   update public.orders set status='cancelled',updated_at=clock_timestamp() where id=p_order_id;
   if o.payment_method='paypal' then perform public.release_paypal_account(o.paypal_email,o.order_number); end if;
   o.status:='cancelled';
 end if;
 checking:=o.payment_method in ('crypto','card-crypto') and o.status in ('awaiting_payment','processing','cancelled')
   and expired and until_at>clock_timestamp();
 return public.get_order_public(p_order_id) || jsonb_build_object(
   'status',case when expired and o.status='awaiting_payment' then 'cancelled' else o.status end,
   'session_expired',expired,
   'reconciliation_pending',coalesce(checking,false),
   'reconciliation_until',case when o.payment_method in ('crypto','card-crypto') then until_at else null end,
   'plan_id',o.plan_id,'site_name',o.site_name,'server_now',clock_timestamp(),
   'invoice_id',case when not expired and o.status='awaiting_payment' and o.payment_method='crypto'
     then o.payment_reference->>'invoice_id' else null end);
end
$function$;
