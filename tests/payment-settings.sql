-- Exercise the operator rule patch and checkout evaluator together.
-- No committed changes and no payments or customer lookups.
begin;
do $test$
declare method text; mode text; verdict jsonb; saved jsonb; brand text;
begin
  select site_name into brand from public.site_settings
    where site_name <> 'default' order by site_name limit 1;
  foreach method in array array['paypal','crypto','card-crypto','giftcard'] loop
    foreach mode in array array['disabled','enabled','restricted'] loop
      saved := public.checkout_set_method_rule('default',method,
        jsonb_build_object('mode',mode,'require_whatsapp',false,'allowed_countries',null));
      verdict := public.checkout_payment_eligibility('default',array[method],null,
        'settings-contract@example.invalid',null,null,null);
      if (verdict->>method)::boolean is distinct from (mode <> 'disabled') then
        raise exception 'Mode not enforced: % / %',method,mode;
      end if;
    end loop;
    if brand is not null then
      perform public.checkout_set_method_rule('default',method,'{"mode":"disabled"}');
      delete from public.payment_method_rules where site_name=brand and payment_method=method;
      verdict := public.checkout_payment_eligibility(brand,array[method],null,null,null,null,null);
      if (verdict->>method)::boolean then raise exception 'Disabled default not inherited'; end if;
      perform public.checkout_set_method_rule(brand,method,'{"mode":"enabled"}');
      verdict := public.checkout_payment_eligibility(brand,array[method],null,null,null,null,null);
      if not (verdict->>method)::boolean then raise exception 'Brand enable not applied'; end if;
      delete from public.payment_method_rules where site_name=brand and payment_method=method;
      verdict := public.checkout_payment_eligibility(brand,array[method],null,null,null,null,null);
      if (verdict->>method)::boolean then raise exception 'Delete did not restore default'; end if;
    end if;
  end loop;
end $test$;
rollback;
select 'PASS: all four rails, all three modes, inherited disable, brand override and default restoration; rolled back' as result;
