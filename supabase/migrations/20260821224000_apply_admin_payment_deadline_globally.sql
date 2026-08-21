begin;

-- Saving the admin-created booking deadline is a global policy operation.
-- Recalculate every open staff-created booking that is still using an
-- automatic deadline. Explicit per-reservation exceptions remain protected.
create or replace function public.set_admin_booking_policy(
  p_minimum_rental_days integer,
  p_advance_notice_minutes integer,
  p_admin_booking_payment_deadline_minutes integer
) returns public.booking_policy_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.booking_policy_settings%rowtype;
  v_updated public.booking_policy_settings%rowtype;
  v_rental public.rentals%rowtype;
  v_previous_payment_due_at timestamptz;
  v_existing_deadlines_updated integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_minimum_rental_days is null
     or p_minimum_rental_days < 1
     or p_minimum_rental_days > 30 then
    raise exception 'Minimum rental duration must be between 1 and 30 days.';
  end if;
  if p_advance_notice_minutes is null
     or p_advance_notice_minutes < 0
     or p_advance_notice_minutes > 525600 then
    raise exception 'Advance notice must be between immediate and 365 days.';
  end if;
  if p_admin_booking_payment_deadline_minutes is null
     or p_admin_booking_payment_deadline_minutes < 5
     or p_admin_booking_payment_deadline_minutes > 10080 then
    raise exception 'Admin booking payment deadline must be between 5 minutes and 7 days.';
  end if;

  select * into v_previous
  from public.booking_policy_settings
  where id = true
  for update;

  update public.booking_policy_settings
  set minimum_rental_days = p_minimum_rental_days,
      advance_notice_minutes = p_advance_notice_minutes,
      admin_booking_payment_deadline_minutes = p_admin_booking_payment_deadline_minutes,
      updated_by = auth.uid(),
      updated_at = now()
  where id = true
  returning * into v_updated;

  -- Anchor the policy to booking creation time. Re-saving the same setting is
  -- therefore idempotent and cannot silently extend every open reservation.
  for v_rental in
    select rental.*
    from public.rentals rental
    where rental.booking_source = 'admin_manual'
      and lower(coalesce(rental.payment_status, 'pending')) not in (
        'paid', 'partially_paid', 'partial'
      )
      and lower(coalesce(rental.status, 'pending')) in (
        'pending', 'documents_needed', 'document_review', 'approved',
        'ready_for_pickup'
      )
      and not exists (
        select 1
        from public.rental_audit_events event
        where event.rental_id = rental.id
          and event.event_type in (
            'admin_payment_deadline_changed',
            'admin_payment_deadline_extended',
            'admin_cancelled_unpaid_reservation_restored'
          )
      )
    for update of rental
  loop
    v_previous_payment_due_at := v_rental.payment_due_at;

    update public.rentals
    set payment_due_at = v_rental.created_at
          + make_interval(mins => p_admin_booking_payment_deadline_minutes),
        checkout_expires_at = null,
        updated_at = now()
    where id = v_rental.id
    returning * into v_rental;

    v_existing_deadlines_updated := v_existing_deadlines_updated + 1;

    insert into public.rental_audit_events (
      rental_id, user_id, actor_id, event_type, event_payload
    ) values (
      v_rental.id,
      v_rental.user_id,
      auth.uid(),
      'global_admin_payment_deadline_applied',
      jsonb_build_object(
        'previous_payment_due_at', v_previous_payment_due_at,
        'payment_due_at', v_rental.payment_due_at,
        'deadline_minutes', p_admin_booking_payment_deadline_minutes,
        'anchored_to_booking_created_at', true,
        'individual_override_preserved', false
      )
    );
  end loop;

  perform public.record_admin_audit_event(
    'booking_policy.updated',
    'booking_policy',
    'global',
    jsonb_build_object(
      'old_minimum_rental_days', v_previous.minimum_rental_days,
      'new_minimum_rental_days', v_updated.minimum_rental_days,
      'old_advance_notice_minutes', v_previous.advance_notice_minutes,
      'new_advance_notice_minutes', v_updated.advance_notice_minutes,
      'old_admin_booking_payment_deadline_minutes',
        v_previous.admin_booking_payment_deadline_minutes,
      'new_admin_booking_payment_deadline_minutes',
        v_updated.admin_booking_payment_deadline_minutes,
      'existing_automatic_admin_deadlines_updated',
        v_existing_deadlines_updated,
      'individual_deadline_exceptions_preserved', true,
      'customer_checkout_deadlines_unchanged', true
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.set_admin_booking_policy(integer, integer, integer)
  from public, anon;
grant execute on function public.set_admin_booking_policy(integer, integer, integer)
  to authenticated;

comment on function public.set_admin_booking_policy(integer, integer, integer) is
  'Sets global booking rules and reapplies the staff-created unpaid deadline to existing automatic admin bookings while preserving explicit per-rental exceptions and customer checkout holds.';

notify pgrst, 'reload schema';

commit;
