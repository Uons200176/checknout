-- Run only as a transaction: no test customer, token, rule or email survives.
begin;
do $test$
declare m text; t uuid; o jsonb; v_id uuid; n bigint; secret text; proof text; r jsonb; seconds numeric; payload text;
begin
 select value into secret from public.service_secrets where name='order_update_hmac';
 foreach m in array array['paypal','giftcard','crypto','card-crypto'] loop
   insert into public.payment_method_rules(site_name,payment_method,mode,require_whatsapp)
   values('default',m,'enabled',false) on conflict(site_name,payment_method) do update set mode='enabled',require_whatsapp=false;
   insert into public.payment_tokens(difficulty,captcha_required) values(0,false) returning token into t;
   o:=public.create_order(t,'0',null,jsonb_build_object('site_name','default','customer_name','Checkout Test',
     'customer_email','checkout-test@example.invalid','plan_id','1-month','plan_name','Starter','plan_duration','1 Month',
     'connections',1,'payment_method',m,'plan_price',0.01,'paypal_email','forged@example.invalid','session_expires_at','2099-01-01'));
   v_id:=(o->>'id')::uuid; n:=(o->>'order_number')::bigint;
   seconds:=extract(epoch from (o->>'session_expires_at')::timestamptz-clock_timestamp());
   if abs(seconds - case m when 'paypal' then 1800 when 'giftcard' then 7200 when 'crypto' then 18000 else 43200 end)>3 then raise exception 'TTL mismatch: %',m; end if;
   if (o->>'plan_price')::numeric=0.01 or (select paypal_email is not null from public.orders where orders.id=v_id) then raise exception 'Client fields trusted'; end if;
   proof:=encode(extensions.hmac(v_id::text,secret,'sha256'),'hex');
   -- Different manual routes may not mutate this order.
   begin
     if m<>'paypal' then perform public.confirm_paypal_order(v_id,null,proof);
     else perform public.submit_manual_payment(v_id,'{"giftcard_code":"ABCDEFGHIJKLMNOP"}',proof); end if;
     raise exception 'Method guard missing';
   exception when others then
     if sqlerrm<>'wrong_payment_method' then raise; end if;
   end;
   update public.orders set session_expires_at=clock_timestamp()-interval '1 second' where orders.id=v_id;
   if m='paypal' then r:=public.confirm_paypal_order(v_id,null,proof);
   elsif m='giftcard' then r:=public.submit_manual_payment(v_id,'{"giftcard_code":"ABCDEFGHIJKLMNOP"}',proof);
   else r:=public.get_checkout_order(v_id); end if;
   if r->>'status'<>'cancelled' then raise exception 'Expired order accepted: %',m; end if;
   if m in ('crypto','card-crypto') then
     update public.orders set session_expires_at=clock_timestamp()-interval '30 minutes',
       payment_reference='{"invoice_id":"fixture"}'::jsonb where orders.id=v_id;
     r:=public.get_checkout_order(v_id);
     if r->>'status'<>'cancelled' or not (r->>'session_expired')::boolean or
        not (r->>'reconciliation_pending')::boolean or r->>'invoice_id' is not null then
       raise exception 'Customer grace projection incorrect: %',m;
     end if;
     perform public.cron_cancel_expired_orders();
     if (select status from public.orders where orders.id=v_id)<>'awaiting_payment' then
       raise exception 'Backend cancelled during grace: %',m;
     end if;
     r:=public.list_expired_orders(encode(extensions.hmac('cron:expired',secret,'sha256'),'hex'));
     if exists(select 1 from jsonb_array_elements(r) e where e->>'id'=v_id::text) then
       raise exception 'Backup cron bypasses grace';
     end if;
     payload:='{}';
     r:=public.checkout_dispatch('reconciliation_orders',payload,encode(extensions.hmac('reconciliation_orders:'||payload,secret,'sha256'),'hex'));
     if not exists(select 1 from jsonb_array_elements(r) e where e->>'id'=v_id::text) then
       raise exception 'Provider checks missing during grace';
     end if;
     update public.orders set session_expires_at=clock_timestamp()-interval '61 minutes' where orders.id=v_id;
     r:=public.list_expired_orders(encode(extensions.hmac('cron:expired',secret,'sha256'),'hex'));
     if not exists(select 1 from jsonb_array_elements(r) e where e->>'id'=v_id::text) then
       raise exception 'Backend never expires after grace';
     end if;
     perform public.cron_cancel_expired_orders();
     if (select status from public.orders where orders.id=v_id)<>'cancelled' then
       raise exception 'Backend grace expiry missing';
     end if;
     r:=public.get_checkout_order(v_id);
     if (r->>'reconciliation_pending')::boolean then raise exception 'Grace metadata never ends'; end if;
     r:=public.checkout_dispatch('reconciliation_orders',payload,encode(extensions.hmac('reconciliation_orders:'||payload,secret,'sha256'),'hex'));
     if exists(select 1 from jsonb_array_elements(r) e where e->>'id'=v_id::text) then
       raise exception 'Provider checks outlive grace';
     end if;
     update public.orders set status='processing' where orders.id=v_id;
     perform public.cron_cancel_expired_orders();
     r:=public.get_checkout_order(v_id);
     if r->>'status'<>'processing' then raise exception 'Detected payment auto cancelled'; end if;
   end if;
   -- Authenticated late settlement is retained for HUMAN review.
   payload:=jsonb_build_object('p_order_number',n,'p_status','pending','p_payment_reference',null,
      'p_clearance',encode(extensions.hmac(n::text||':pending',secret,'sha256'),'hex'))::text;
   r:=public.checkout_dispatch('apply_order_status',payload,encode(extensions.hmac('apply_order_status:'||payload,secret,'sha256'),'hex'));
   if r->>'status'<>'pending' then raise exception 'Late settlement lost'; end if;
   r:=public.cancel_order(v_id,proof);
   if (r->>'cancelled')::boolean then raise exception 'Pending order cancelled'; end if;
   r:=public.get_checkout_order(v_id);
   if r->>'status'<>'pending' then raise exception 'Pending expired'; end if;
   if (select jsonb_typeof(payment_reference) from public.orders where orders.id=v_id)<>'object' then raise exception 'Reference JSON corrupted'; end if;
   if not exists(select 1 from public.checkout_receipts where order_number=n) then raise exception 'Receipt not queued'; end if;
   begin
     perform public.apply_order_status(n,'completed',null,null,encode(extensions.hmac(n::text||':completed',secret,'sha256'),'hex'));
     raise exception 'Gateway completed account automatically';
   exception when others then if sqlerrm<>'invalid_gateway_status' then raise; end if; end;
 end loop;
 begin
   perform public.checkout_dispatch('queue_receipt','{}','forged');
   raise exception 'Dispatcher accepted forged signature';
 exception when others then if sqlerrm<>'bad_clearance' then raise; end if; end;
end $test$;
select 'PASS: four TTLs, authoritative price/recipient, method guards, expiry, late settlement, pending protection, outbox, HMAC, customer/backend grace separation, both crons and provider cutoff' as result;
rollback;
