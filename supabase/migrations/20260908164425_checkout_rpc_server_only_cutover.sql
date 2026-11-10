-- CUTOVER: deploy checkout v2 and Backend worker first. Do not apply to v1.
-- Only the action/payload-signed dispatcher is exposed to the public transport.
do $cutover$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p
 where p.pronamespace='public'::regnamespace and p.proname=any(array[
   'create_order','issue_payment_challenge','precheck_cached','precheck_record',
   'confirm_paypal_order','submit_manual_payment','cancel_order','save_paypal_txn',
   'assign_paypal_account','release_paypal_account','get_order_public','get_order',
   'update_order_reference','apply_order_status','list_expired_orders','claim_receipt_email'
 ]) loop
   execute format('revoke all on function %s from public, anon, authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $cutover$;
