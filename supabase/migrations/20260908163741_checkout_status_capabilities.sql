-- Only the server-signed status reader can expose an order's saved invoice.
create or replace function public.get_checkout_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $status$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then return null; end if;
 if o.status='awaiting_payment' and (o.session_expires_at is null or o.session_expires_at<=clock_timestamp()) then
   update public.orders set status='cancelled',updated_at=now() where id=o.id;
   if o.payment_method='paypal' then perform public.release_paypal_account(o.paypal_email,o.order_number); end if;
   o.status:='cancelled';
 end if;
 return public.get_order_public(p_order_id) || jsonb_build_object(
   'plan_id',o.plan_id,'site_name',o.site_name,'server_now',clock_timestamp(),
   'invoice_id',case when o.status='awaiting_payment' and o.payment_method='crypto' then o.payment_reference->>'invoice_id' else null end);
end $status$;
revoke all on function public.get_checkout_order(uuid) from public,anon,authenticated;
