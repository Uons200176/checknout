-- Additive rollout: v3 routes use the strict signed policy; legacy RPC removal
-- remains a coordinated post-deployment cutover. No merchant rules are changed.
create or replace function public.checkout_payment_eligibility(
 p_site text,p_methods text[],p_phone text default null,p_email text default null,
 p_declared_country text default null,p_ip_country text default null,p_phone_country text default null
) returns jsonb language plpgsql security definer set search_path=''
as $policy$
declare
 v_site text; v_out jsonb:='{}'; v_method text; v_rule public.payment_method_rules%rowtype;
 v_phone text:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
 v_email text:=nullif(lower(btrim(coalesce(p_email,''))),'');
 v_declared text:=nullif(upper(btrim(coalesce(p_declared_country,''))),'');
 v_ip text:=nullif(upper(btrim(coalesce(p_ip_country,''))),'');
 v_phone_country text:=nullif(upper(btrim(coalesce(p_phone_country,''))),'');
 v_countries text[]; v_blocked boolean; v_ok boolean; v_secs int; v_on boolean;
begin
 select site_name into v_site from public.site_settings where site_name=p_site or domain=p_site
 order by (site_name=p_site) desc limit 1;
 v_site:=coalesce(v_site,'default');
 select enabled,cache_seconds into v_on,v_secs from public.precheck_settings where site_name=v_site;
 if not found then select enabled,cache_seconds into v_on,v_secs from public.precheck_settings where site_name='default'; end if;
 foreach v_method in array coalesce(p_methods,array[]::text[]) loop
   if v_method is null then continue; end if;
   if v_method not in ('paypal','giftcard','crypto','card-crypto') then
     v_out:=v_out||jsonb_build_object(v_method,false); continue;
   end if;
   select * into v_rule from public.payment_method_rules where site_name=v_site and payment_method=v_method;
   if not found then select * into v_rule from public.payment_method_rules where site_name='default' and payment_method=v_method; end if;
   v_ok:=coalesce(v_rule.mode,'enabled') in ('enabled','restricted');
   -- PayPal blocklist always wins, including mode=enabled and a missing rule.
   -- Other rails retain their existing restricted-mode blocklist semantics.
   if v_ok and (v_method='paypal' or v_rule.mode='restricted') then
     select exists(select 1 from public.payment_blocklist b where b.site_name in (v_site,'default') and (
       (b.kind='email' and lower(btrim(b.value))=v_email) or
       (b.kind='phone' and regexp_replace(b.value,'[^0-9]','','g')=v_phone) or
       (b.kind='country' and upper(btrim(b.value)) in (v_declared,v_ip,v_phone_country))
     )) into v_blocked;
     v_ok:=not v_blocked;
   end if;
   if v_ok and v_rule.mode='restricted' then
     if v_rule.require_whatsapp then
       v_ok:=coalesce(v_on,true) and exists(select 1 from public.checkout_prechecks c
         where c.phone_key=v_phone and c.has_whatsapp is true
         and c.checked_at>clock_timestamp()-make_interval(secs=>coalesce(v_secs,86400)));
     end if;
     if v_ok and cardinality(v_rule.allowed_countries)>0 then
       select array_agg(upper(btrim(x))) into v_countries from unnest(v_rule.allowed_countries) x;
       -- Membership in the SAME allow-list, NOT equality between countries.
       -- Missing/unknown IP or phone country cannot satisfy a country restriction.
       v_ok:=coalesce(v_declared=any(v_countries),false)
         and coalesce(v_ip=any(v_countries),false)
         and coalesce(v_phone_country=any(v_countries),false);
     end if;
   end if;
   v_out:=v_out||jsonb_build_object(v_method,coalesce(v_ok,false));
 end loop;
 return v_out;
end $policy$;
revoke all on function public.checkout_payment_eligibility(text,text[],text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.checkout_payment_eligibility(text,text[],text,text,text,text,text) to service_role;

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
 when 'payment_eligibility_v3' then
   return public.checkout_payment_eligibility(p->>'p_site',array(select jsonb_array_elements_text(p->'p_methods')),
     p->>'p_phone',p->>'p_email',p->>'p_declared_country',p->>'p_ip_country',p->>'p_phone_country');
 when 'create_order_v3' then
   r:=public.checkout_payment_eligibility(p->'p_order'->>'site_name',array[p->'p_order'->>'payment_method'],
     p->'p_order'->>'customer_phone_key',p->'p_order'->>'customer_email',
     p->'p_order'->>'customer_country',p->'p_order'->>'customer_ip_country',p->'p_order'->>'customer_phone_country');
   if coalesce((r->>(p->'p_order'->>'payment_method'))::boolean,false) is not true then
     raise exception 'method_not_allowed';
   end if;
   return public.create_order((p->>'p_token')::uuid,p->>'p_nonce',p->>'p_clearance',p->'p_order');
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

-- Operator-only atomic configuration patch. Never reset a rule after a failed read.
create or replace function public.checkout_set_method_rule(p_site text,p_method text,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $rule$
declare base public.payment_method_rules%rowtype; result public.payment_method_rules%rowtype; countries text[];
begin
 if p_method not in ('paypal','giftcard','crypto','card-crypto','card') or p_method is null
   or p_site is null or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'invalid_rule'; end if;
 if p_patch ? 'mode' and coalesce(p_patch->>'mode','') not in ('enabled','disabled','restricted') then raise exception 'invalid_mode'; end if;
 if p_patch ? 'require_whatsapp' and jsonb_typeof(p_patch->'require_whatsapp') is distinct from 'boolean' then raise exception 'invalid_whatsapp_flag'; end if;
 if p_patch ? 'allowed_countries' and p_patch->'allowed_countries'<>'null'::jsonb then
   if jsonb_typeof(p_patch->'allowed_countries')<>'array' then raise exception 'invalid_countries'; end if;
   if exists(select 1 from jsonb_array_elements(p_patch->'allowed_countries') x
     where jsonb_typeof(x)<>'string' or btrim(x#>>'{}') !~ '^[A-Za-z]{2}$') then raise exception 'invalid_countries'; end if;
   select array_agg(distinct upper(btrim(x))) into countries from jsonb_array_elements_text(p_patch->'allowed_countries') x;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout_rule:'||p_site||':'||p_method,0));
 select * into base from public.payment_method_rules where site_name=p_site and payment_method=p_method;
 if not found then select * into base from public.payment_method_rules where site_name='default' and payment_method=p_method; end if;
 insert into public.payment_method_rules(site_name,payment_method,mode,require_whatsapp,allowed_countries,updated_at)
 values(p_site,p_method,coalesce(p_patch->>'mode',base.mode,'enabled'),
   coalesce((p_patch->>'require_whatsapp')::boolean,base.require_whatsapp,true),
   case when p_patch ? 'allowed_countries' then countries else base.allowed_countries end,clock_timestamp())
 on conflict(site_name,payment_method) do update set mode=excluded.mode,require_whatsapp=excluded.require_whatsapp,
   allowed_countries=excluded.allowed_countries,updated_at=excluded.updated_at returning * into result;
 return to_jsonb(result);
end $rule$;
revoke all on function public.checkout_set_method_rule(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_set_method_rule(text,text,jsonb) to service_role;
