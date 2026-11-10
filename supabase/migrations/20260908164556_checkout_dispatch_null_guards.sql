create or replace function public.checkout_dispatch(p_action text,p_payload text,p_clearance text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
