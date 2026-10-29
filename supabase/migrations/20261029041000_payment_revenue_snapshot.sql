begin;
set local lock_timeout = '2s';

-- One MVCC snapshot replaces separately paginated HTTP reads. Keep the
-- existing receipt projections, ID ordering, and caller's row-level policies.
create function public.admin_payment_revenue_snapshot() returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog,public
set statement_timeout = '8s'
as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false)
    or not coalesce(public.rentmect_has_permission('tab.payments'),false)
    or not coalesce(public.rentmect_has_permission('reports.financial'),false)
    or not exists(select 1 from public.profiles where id=auth.uid() and lower(email)='anconamgt@aol.com') then
    raise exception 'Revenue report access denied.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'rentals',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_total,service_fee_total,tax_amount,security_deposit,paid_at,payment_amount_cents,deposit_held_amount,deposit_released_amount,deposit_status,stripe_payment_intent_id,stripe_checkout_session_id,created_at from public.rentals order by id limit 500001) r),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_id,status,payment_type,total_amount,rental_amount,tax_amount,deposit_amount,paid_at,refunded_amount,deposit_refunded_at,stripe_payment_intent_id,stripe_checkout_session_id,created_at from public.rental_payments order by id limit 500001) r),'[]'::jsonb),
    'charges',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_id,charge_type,included_in_initial_payment,status,payment_provider,total_amount,tax_amount,payment_amount_cents,paid_at,stripe_payment_intent_id,stripe_checkout_session_id,amount,created_at from public.rental_charge_items order by id limit 500001) r),'[]'::jsonb),
    'extensions',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_id,replacement_rental_id,status,payment_status,request_kind,extension_rental_amount,extension_tax_amount,extension_total_amount,extension_deposit_amount,payment_amount_cents,paid_at,stripe_payment_intent_id,stripe_checkout_session_id,created_at from public.rental_extension_requests order by id limit 500001) r),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_id,status,source_type,stripe_refund_id,stripe_payment_intent_id,extension_request_id,amount,created_at from public.rental_payment_refunds order by id limit 500001) r),'[]'::jsonb),
    'externalActions',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_id,action_type,amount,deposit_amount_returned,payment_charge_id,created_at from public.rental_external_payment_actions order by id limit 500001) r),'[]'::jsonb),
    'applications',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,rental_id,allocation_id,charge_id,amount,created_at from public.rental_deposit_charge_applications order by id limit 500001) r),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,source_rental_id,holder_rental_id,source_kind,amount_held,amount_applied,stripe_payment_intent_id from public.rental_deposit_allocations order by id limit 500001) r),'[]'::jsonb)
  ) into result;
  if exists(select 1 from jsonb_each(result) entry where jsonb_array_length(entry.value)>500000) then
    raise exception 'Revenue history exceeded the reporting limit.';
  end if;
  return result;
end;
$$;
revoke all on function public.admin_payment_revenue_snapshot() from public,anon;
grant execute on function public.admin_payment_revenue_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;
