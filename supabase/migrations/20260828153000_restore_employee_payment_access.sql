begin;

-- Payment activity is operational data these employees need. Keep the two
-- aggregate dashboard totals behind a separate, per-account permission so
-- restricting the summary never removes the Payments tab or its ledger data.
insert into public.employee_permissions (
  permission_key, label, category, description, enabled, updated_by, updated_at
) values (
  'dashboard.financial_summary',
  'Dashboard financial summary',
  'Sensitive access',
  'View Month Revenue and Active Deposits totals on the dashboard.',
  true,
  null,
  now()
)
on conflict (permission_key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  updated_at = now();

insert into public.staff_permission_overrides (
  user_id, permission_key, enabled, reason, updated_by, updated_at
)
select
  profile.id,
  requested.permission_key,
  requested.enabled,
  requested.reason,
  null,
  now()
from public.profiles profile
cross join (
  values
    ('dashboard.financial_summary', false, 'Dashboard gross totals hidden by management request.'),
    ('reports.financial', true, 'Payment activity retained by management request.'),
    ('tab.payments', true, 'Payments tab retained by management request.')
) as requested(permission_key, enabled, reason)
where lower(coalesce(profile.email, '')) in (
  'jmisantonis@gmail.com',
  'barose1217@icloud.com',
  'kfaraci93@gmail.com'
)
  and profile.role = 'admin'
  and profile.staff_role = 'employee'
on conflict (user_id, permission_key) do update set
  enabled = excluded.enabled,
  reason = excluded.reason,
  updated_by = null,
  updated_at = now();

-- Redact only the dashboard aggregates at the database boundary. Payment and
-- deposit tables continue to use reports.financial, which remains enabled for
-- the three operational employee accounts above.
create or replace function public.get_admin_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_can_view_financial_summary boolean := coalesce(public.rentmect_has_permission('dashboard.financial_summary'), false);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  with paid_rentals as (
    select rental.*
    from public.rentals rental
    where lower(coalesce(rental.status, '')) <> 'cancelled'
      and (
        lower(coalesce(rental.payment_status, '')) in ('paid', 'partially_paid', 'partial')
        or lower(coalesce(rental.deposit_status, '')) in ('held', 'adjustment_refund_due', 'release_pending')
        or rental.paid_at is not null
        or lower(coalesce(rental.status, '')) in ('documents_needed', 'document_review', 'ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated')
      )
  ), return_rows as (
    select
      to_jsonb(rental) || jsonb_build_object(
        'vehicles', to_jsonb(vehicle),
        'profiles', to_jsonb(profile)
      ) as rental,
      public.rentmect_rental_timestamp(rental.return_date, rental.return_time)
        at time zone 'America/New_York' as due_at,
      lower(coalesce(rental.status, '')) = 'overdue'
        or (public.rentmect_rental_timestamp(rental.return_date, rental.return_time)
          at time zone 'America/New_York') < v_now as overdue
    from paid_rentals rental
    left join public.vehicles vehicle on vehicle.id = rental.vehicle_id
    left join public.profiles profile on profile.id = rental.user_id
    where lower(coalesce(rental.status, '')) not in ('completed', 'cancelled')
      and rental.return_date is not null
  ), maintenance as (
    select count(distinct vehicle.id)::integer as due_count
    from public.vehicles vehicle
    left join public.vehicle_maintenance_schedules schedule on schedule.vehicle_id = vehicle.id
    where coalesce(vehicle.maintenance_lock_active, false)
       or (schedule.active and schedule.next_due_at is not null and schedule.next_due_at <= current_date)
       or (schedule.active and schedule.next_due_mileage is not null and coalesce(vehicle.current_mileage, 0) >= schedule.next_due_mileage)
  )
  select jsonb_build_object(
    'cars_out', (select count(*) from paid_rentals where lower(coalesce(status, '')) in ('ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated')),
    'overdue_count', (select count(*) from return_rows where overdue),
    'maintenance_due', coalesce((select due_count from maintenance), 0),
    'month_revenue', case when v_can_view_financial_summary then coalesce((select sum(coalesce(rental_total, 0) + coalesce(tax_amount, 0)) from paid_rentals where payment_status = 'paid' and date_trunc('month', coalesce(paid_at, created_at)) = date_trunc('month', v_now)), 0) else null end,
    'active_deposits', case when v_can_view_financial_summary then coalesce((select sum(coalesce(deposit_held_amount, 0)) from paid_rentals where lower(coalesce(deposit_status, '')) in ('held', 'adjustment_refund_due', 'release_pending')), 0) else null end,
    'overdue_rentals', coalesce((select jsonb_agg(rental order by due_at) from return_rows where overdue), '[]'::jsonb),
    'due_soon_rentals', coalesce((select jsonb_agg(rental order by due_at) from return_rows where not overdue and due_at <= v_now + interval '24 hours'), '[]'::jsonb),
    'emergency_exceptions', coalesce((
      select jsonb_agg(
        to_jsonb(exception) || jsonb_build_object(
          'rentals', to_jsonb(rental) || jsonb_build_object('vehicles', to_jsonb(vehicle), 'profiles', to_jsonb(profile))
        ) order by exception.expires_at
      )
      from public.rental_emergency_exceptions exception
      left join public.rentals rental on rental.id = exception.rental_id
      left join public.vehicles vehicle on vehicle.id = rental.vehicle_id
      left join public.profiles profile on profile.id = rental.user_id
      where exception.status = 'active'
    ), '[]'::jsonb),
    'generated_at', v_now
  ) into v_snapshot;

  return v_snapshot;
end;
$$;
revoke all on function public.get_admin_dashboard_snapshot() from public, anon;
grant execute on function public.get_admin_dashboard_snapshot() to authenticated;

insert into public.admin_audit_logs (
  actor_user_id, actor_email, actor_role, action, entity_type, entity_id, changed_fields, new_values, metadata
)
select null, 'support-maintenance', 'system', 'staff.payment_access_restored',
  'profile', profile.id::text,
  array['dashboard.financial_summary', 'reports.financial', 'tab.payments'],
  jsonb_build_object(
    'dashboard.financial_summary', false,
    'reports.financial', true,
    'tab.payments', true
  ),
  jsonb_build_object('target_email', profile.email, 'source', 'explicit_management_correction')
from public.profiles profile
where lower(coalesce(profile.email, '')) in (
  'jmisantonis@gmail.com',
  'barose1217@icloud.com',
  'kfaraci93@gmail.com'
);

commit;
