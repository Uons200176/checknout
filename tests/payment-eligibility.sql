-- No persistent rules, customers, prechecks, blocklist entries, orders or receipts.
begin;
do $test$
declare r jsonb; c record; token uuid; payload text; secret text; order_id uuid; proof text; other_site text;
begin
 insert into public.payment_method_rules(site_name,payment_method,mode,require_whatsapp,allowed_countries)
 values('default','paypal','restricted',true,array['US','CA'])
 on conflict(site_name,payment_method) do update set mode='restricted',require_whatsapp=true,allowed_countries=array['US','CA'];
 insert into public.precheck_settings(site_name,enabled,cache_seconds) values('default',true,3600)
 on conflict(site_name) do update set enabled=true,cache_seconds=3600;
 insert into public.checkout_prechecks(phone_key,has_whatsapp,site_name,checked_at)
 values('12025550100',true,'default',clock_timestamp())
 on conflict(phone_key) do update set has_whatsapp=true,checked_at=clock_timestamp();
 for c in select * from (values
   ('US','CA','US',true),('CA','US','CA',true),('CA','CA','US',true),('US','US','CA',true),
   ('CA','MA','CA',false),('US',null,'US',false),('US','XX','US',false),('US','T1','US',false),
   ('MA','US','US',false),('US','US','MA',false),('US','US',null,false),(' us ',' ca ','us',true)
 ) as cases(declared,ip,phone_country,expected) loop
   r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid',c.declared,c.ip,c.phone_country);
   if (r->>'paypal')::boolean is distinct from c.expected then raise exception 'Country case failed: %',row_to_json(c); end if;
 end loop;
 update public.checkout_prechecks set checked_at=clock_timestamp()-interval '2 hours' where phone_key='12025550100';
 r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid','US','CA','US');
 if (r->>'paypal')::boolean then raise exception 'Stale WhatsApp passed'; end if;
 update public.checkout_prechecks set checked_at=clock_timestamp(),has_whatsapp=false where phone_key='12025550100';
 r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid','US','CA','US');
 if (r->>'paypal')::boolean then raise exception 'Negative WhatsApp passed'; end if;
 update public.checkout_prechecks set has_whatsapp=null where phone_key='12025550100';
 r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid','US','CA','US');
 if (r->>'paypal')::boolean then raise exception 'Unknown WhatsApp passed'; end if;
 update public.checkout_prechecks set has_whatsapp=true where phone_key='12025550100';
 insert into public.payment_blocklist(site_name,kind,value) values('default','email',' ELIGIBILITY-TEST@EXAMPLE.INVALID ');
 r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid','US','CA','US');
 if (r->>'paypal')::boolean then raise exception 'Blocklist lost to valid country/WhatsApp'; end if;
 update public.payment_method_rules set mode='enabled' where site_name='default' and payment_method='paypal';
 r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid','US','CA','US');
 if (r->>'paypal')::boolean then raise exception 'Enabled bypassed PayPal blocklist'; end if;
 delete from public.payment_blocklist where site_name='default' and kind='email' and value=' ELIGIBILITY-TEST@EXAMPLE.INVALID ';
 -- Default block entries are global, brand-specific entries stay local.
 select site_name into other_site from public.site_settings where site_name<>'default' order by site_name limit 1;
 if other_site is not null then
   perform public.checkout_set_method_rule(other_site,'paypal','{"mode":"enabled"}');
   insert into public.payment_blocklist(site_name,kind,value) values(other_site,'email','eligibility-brand@example.invalid');
   r:=public.checkout_payment_eligibility(other_site,array['paypal'],null,'eligibility-brand@example.invalid',null,null,null);
   if (r->>'paypal')::boolean then raise exception 'Brand block ignored'; end if;
   r:=public.checkout_payment_eligibility('default',array['paypal'],null,'eligibility-brand@example.invalid',null,null,null);
   if not (r->>'paypal')::boolean then raise exception 'Brand block leaked to another brand'; end if;
   insert into public.payment_blocklist(site_name,kind,value) values('default','email','eligibility-global@example.invalid');
   r:=public.checkout_payment_eligibility(other_site,array['paypal'],null,'eligibility-global@example.invalid',null,null,null);
   if (r->>'paypal')::boolean then raise exception 'Global block bypassed by brand override'; end if;
 end if;
 update public.payment_method_rules set mode='disabled' where site_name='default' and payment_method='paypal';
 r:=public.checkout_payment_eligibility('default',array['paypal'],'12025550100','eligibility-test@example.invalid','US','CA','US');
 if (r->>'paypal')::boolean then raise exception 'Disabled method displayed'; end if;
 -- Omitted fields stay; explicit [] clears; lower-case/duplicate input is normalized.
 r:=public.checkout_set_method_rule('default','paypal','{"mode":"restricted"}');
 if r->'allowed_countries'<>'["US","CA"]'::jsonb or not (r->>'require_whatsapp')::boolean then raise exception 'Patch reset restrictions'; end if;
 r:=public.checkout_set_method_rule('default','paypal','{"allowed_countries":[" ca ","us","US"]}');
 if jsonb_array_length(r->'allowed_countries')<>2 or r->>'mode'<>'restricted' then raise exception 'Country normalization failed'; end if;
 begin
   perform public.checkout_set_method_rule('default','paypal','{"allowed_countries":[""]}');
   raise exception 'Invalid rule accepted';
 exception when others then if sqlerrm<>'invalid_countries' then raise; end if; end;
 -- Signed new-order boundary rechecks policy with trusted server identity.
 select value into secret from public.service_secrets where name='order_update_hmac';
 insert into public.payment_tokens(difficulty,captcha_required) values(0,false) returning payment_tokens.token into token;
 payload:=jsonb_build_object('p_token',token,'p_nonce','0','p_order',jsonb_build_object(
   'site_name','default','customer_name','Eligibility Test','customer_email','eligibility-test@example.invalid',
   'customer_phone_key','12025550100','customer_country','US','customer_phone_country','US','customer_ip_country','CA',
   'plan_id','1-month','plan_name','Starter','plan_duration','1 Month','connections',1,'payment_method','paypal'))::text;
 r:=public.checkout_dispatch('create_order_v3',payload,encode(extensions.hmac('create_order_v3:'||payload,secret,'sha256'),'hex'));
 order_id:=(r->>'id')::uuid;
 if order_id is null then raise exception 'Qualified cross-country create failed'; end if;
 payload:=jsonb_set(payload::jsonb,'{p_order,customer_ip_country}','"MA"')::text;
 begin
   perform public.checkout_dispatch('create_order_v3',payload,encode(extensions.hmac('create_order_v3:'||payload,secret,'sha256'),'hex'));
   raise exception 'Travel bypassed create policy';
 exception when others then if sqlerrm<>'method_not_allowed' then raise; end if; end;
 payload:=jsonb_set(payload::jsonb,'{p_order,customer_ip_country}','null')::text;
 begin
   perform public.checkout_dispatch('create_order_v3',payload,encode(extensions.hmac('create_order_v3:'||payload,secret,'sha256'),'hex'));
   raise exception 'Missing IP bypassed create policy';
 exception when others then if sqlerrm<>'method_not_allowed' then raise; end if; end;
 if has_function_privilege('anon','public.checkout_payment_eligibility(text,text[],text,text,text,text,text)','execute')
   or has_function_privilege('anon','public.checkout_set_method_rule(text,text,jsonb)','execute') then raise exception 'Private policy exposed'; end if;
end $test$;
select 'PASS: cross-country membership, required IP/phone country, travel, WhatsApp freshness, priority blocklist, atomic settings patch, signed creation, private ACLs' as result;
rollback;
