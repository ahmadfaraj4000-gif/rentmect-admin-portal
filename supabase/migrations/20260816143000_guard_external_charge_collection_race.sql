begin;

-- The Edge Function inspects and closes any Stripe collection path before it
-- records cash or another external payment. Re-check the exact charge state
-- under the row lock so a concurrent saved-card attempt cannot be hidden by
-- the external settlement.
create or replace function public.record_admin_external_rental_charge_payment_guarded(
  p_charge_id uuid,
  p_payment_method text,
  p_reference text default null,
  p_actor_id uuid default null,
  p_expected_status text default null,
  p_expected_checkout_session_id text default null,
  p_expected_payment_intent_id text default null,
  p_expected_admin_charge_attempts integer default 0
) returns public.rental_charge_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.rental_charge_items%rowtype;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_actor_id uuid := coalesce(p_actor_id, auth.uid());
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;
  if v_actor_id is null or not exists (
    select 1 from public.profiles
    where id = v_actor_id
      and role = 'admin'
      and staff_role in ('owner', 'operations_manager', 'employee')
  ) then
    raise exception 'A valid staff actor is required.';
  end if;
  if v_method not in ('card', 'terminal', 'cash_app', 'cash', 'bank_transfer', 'other') then
    raise exception 'Choose how the external payment was received.';
  end if;

  select * into v_charge
  from public.rental_charge_items
  where id = p_charge_id
  for update;

  if not found then raise exception 'Rental charge not found.'; end if;
  if v_charge.included_in_initial_payment then
    raise exception 'This fee was included in the original rental payment.';
  end if;
  if v_charge.status = 'paid' then return v_charge; end if;
  if v_charge.status = 'waived' then
    raise exception 'A waived charge cannot be recorded as paid.';
  end if;
  if v_charge.status not in ('pending', 'failed', 'checkout_open') then
    raise exception 'This charge cannot be collected in its current state.';
  end if;

  if v_charge.status is distinct from p_expected_status
     or v_charge.stripe_checkout_session_id is distinct from p_expected_checkout_session_id
     or v_charge.stripe_payment_intent_id is distinct from p_expected_payment_intent_id
     or coalesce(v_charge.admin_charge_attempts, 0) <> coalesce(p_expected_admin_charge_attempts, 0) then
    raise exception 'Charge collection changed while the external payment was being recorded. Refresh and try again.';
  end if;

  update public.rental_charge_items
  set status = 'paid',
      payment_provider = 'local',
      payment_amount_cents = round(total_amount * 100)::integer,
      payment_currency = 'usd',
      paid_at = now(),
      external_payment_method = v_method,
      external_payment_reference = nullif(trim(coalesce(p_reference, '')), ''),
      external_payment_recorded_by = v_actor_id,
      stripe_checkout_session_id = null,
      stripe_payment_intent_id = null,
      last_admin_charge_error = null,
      updated_at = now()
  where id = v_charge.id
  returning * into v_charge;

  insert into public.rental_audit_events (
    rental_id, user_id, actor_id, event_type, event_payload
  ) values (
    v_charge.rental_id,
    v_charge.user_id,
    v_actor_id,
    'admin_external_rental_charge_payment_recorded',
    jsonb_build_object(
      'charge_id', v_charge.id,
      'charge_name', v_charge.name,
      'amount', v_charge.total_amount,
      'payment_method', v_method,
      'reference', nullif(trim(coalesce(p_reference, '')), '')
    )
  );

  return v_charge;
end;
$$;

revoke all on function public.record_admin_external_rental_charge_payment_guarded(uuid,text,text,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.record_admin_external_rental_charge_payment_guarded(uuid,text,text,uuid,text,text,text,integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
