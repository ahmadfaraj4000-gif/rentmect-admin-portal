begin;

-- External charge collection uses the same durable charge row as Stripe. The
-- Edge Function closes any open Stripe Checkout first; this function performs
-- the final row lock, settlement, and audit write atomically.
alter table public.rental_charge_items
  add column if not exists external_payment_method text,
  add column if not exists external_payment_reference text,
  add column if not exists external_payment_recorded_by uuid
    references auth.users(id) on delete set null;

create or replace function public.record_admin_external_rental_charge_payment(
  p_charge_id uuid,
  p_payment_method text,
  p_reference text default null,
  p_actor_id uuid default null
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

revoke all on function public.record_admin_external_rental_charge_payment(uuid,text,text,uuid) from public;
grant execute on function public.record_admin_external_rental_charge_payment(uuid,text,text,uuid) to service_role;

commit;
