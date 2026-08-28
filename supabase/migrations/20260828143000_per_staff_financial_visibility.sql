begin;

-- Employee permissions were originally shared by every Employee account. Add
-- narrow per-user overrides so one employee can be denied sensitive financial
-- visibility without changing the access of the rest of the team.
create table if not exists public.staff_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.employee_permissions(permission_key) on delete cascade,
  enabled boolean not null,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

alter table public.staff_permission_overrides enable row level security;
drop policy if exists "Staff can read relevant permission overrides" on public.staff_permission_overrides;
create policy "Staff can read relevant permission overrides"
  on public.staff_permission_overrides for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.role = 'admin'
        and actor.staff_role in ('owner', 'operations_manager')
    )
  );
revoke insert, update, delete on public.staff_permission_overrides from anon, authenticated;
grant select on public.staff_permission_overrides to authenticated;

create or replace function public.rentmect_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when profile.staff_role in ('owner', 'operations_manager') then true
    when profile.staff_role = 'employee' then coalesce(
      (
        select override.enabled
        from public.staff_permission_overrides override
        where override.user_id = profile.id
          and override.permission_key = p_permission_key
      ),
      (
        select permission.enabled
        from public.employee_permissions permission
        where permission.permission_key = p_permission_key
      ),
      false
    )
    else false
  end
  from public.profiles profile
  where profile.id = auth.uid() and profile.role = 'admin';
$$;

create or replace function public.get_admin_staff_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'staff_role', profile.staff_role,
    'can_manage_employee_permissions', profile.staff_role = 'owner'
      or lower(coalesce(profile.email, '')) = 'anconamgt@aol.com',
    'permissions', coalesce((
      select jsonb_object_agg(
        permission.permission_key,
        case
          when profile.staff_role in ('owner', 'operations_manager') then true
          else coalesce(override.enabled, permission.enabled)
        end
      )
      from public.employee_permissions permission
      left join public.staff_permission_overrides override
        on override.user_id = profile.id
       and override.permission_key = permission.permission_key
    ), '{}'::jsonb)
  )
  from public.profiles profile
  where profile.id = auth.uid() and profile.role = 'admin';
$$;

create or replace function public.admin_set_staff_permission_override(
  p_user_id uuid,
  p_permission_key text,
  p_enabled boolean,
  p_reason text default null
) returns public.staff_permission_overrides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_override public.staff_permission_overrides%rowtype;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not found or v_actor.role <> 'admin' or not (
    v_actor.staff_role in ('owner', 'operations_manager')
    or lower(coalesce(v_actor.email, '')) = 'anconamgt@aol.com'
  ) then
    raise exception 'Only an authorized manager can change staff permission overrides.';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found or v_target.role <> 'admin' or v_target.staff_role <> 'employee' then
    raise exception 'Permission overrides can only be applied to Employee accounts.';
  end if;
  if not exists (select 1 from public.employee_permissions where permission_key = p_permission_key) then
    raise exception 'Unknown Employee permission.';
  end if;

  insert into public.staff_permission_overrides (
    user_id, permission_key, enabled, reason, updated_by, updated_at
  ) values (
    p_user_id, p_permission_key, p_enabled, nullif(trim(coalesce(p_reason, '')), ''), auth.uid(), now()
  )
  on conflict (user_id, permission_key) do update set
    enabled = excluded.enabled,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_override;

  perform public.record_admin_audit_event(
    'staff_permission_override.updated',
    'profile',
    p_user_id::text,
    jsonb_build_object(
      'permission_key', p_permission_key,
      'enabled', p_enabled,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'target_email', v_target.email
    )
  );
  return v_override;
end;
$$;
revoke all on function public.admin_set_staff_permission_override(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_staff_permission_override(uuid, text, boolean, text) to authenticated;
grant execute on function public.get_admin_staff_context() to authenticated;
grant execute on function public.rentmect_has_permission(text) to authenticated;

-- These two employees retain operational access, but financial pages and data
-- are denied by the same reports.financial permission used by portal routing
-- and the existing restrictive RLS policies on payment/deposit tables.
insert into public.staff_permission_overrides (
  user_id, permission_key, enabled, reason, updated_by, updated_at
)
select profile.id, permission.permission_key, false,
  'Financial visibility restricted by management request.', null, now()
from public.profiles profile
cross join (
  values
    ('reports.financial'),
    ('tab.payments')
) as permission(permission_key)
where lower(coalesce(profile.email, '')) in (
  'jmisantonis@gmail.com',
  'kfaraci93@gmail.com'
)
  and profile.role = 'admin'
  and profile.staff_role = 'employee'
on conflict (user_id, permission_key) do update set
  enabled = false,
  reason = excluded.reason,
  updated_by = null,
  updated_at = now();

-- The deposit task table contains held-dollar amounts. Keep it behind the same
-- server-side financial visibility boundary as payments, refunds, Stripe
-- reconciliation, and deposit allocations.
alter table public.deposit_action_tasks enable row level security;
drop policy if exists "Employee financial visibility guard" on public.deposit_action_tasks;
create policy "Employee financial visibility guard"
  on public.deposit_action_tasks as restrictive for select to authenticated
  using (public.rentmect_employee_permission_allows('reports.financial'));

-- Redact the two financial dashboard metrics in the database response as well
-- as hiding their cards in React. This prevents a restricted employee from
-- recovering the values by calling the dashboard RPC directly.
create or replace function public.get_admin_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_can_view_financials boolean := coalesce(public.rentmect_has_permission('reports.financial'), false);
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
    'month_revenue', case when v_can_view_financials then coalesce((select sum(coalesce(rental_total, 0) + coalesce(tax_amount, 0)) from paid_rentals where payment_status = 'paid' and date_trunc('month', coalesce(paid_at, created_at)) = date_trunc('month', v_now)), 0) else null end,
    'active_deposits', case when v_can_view_financials then coalesce((select sum(coalesce(deposit_held_amount, 0)) from paid_rentals where lower(coalesce(deposit_status, '')) in ('held', 'adjustment_refund_due', 'release_pending')), 0) else null end,
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
select null, 'support-maintenance', 'system', 'staff.financial_visibility_restricted',
  'profile', profile.id::text, array['reports.financial', 'tab.payments'],
  jsonb_build_object('reports.financial', false, 'tab.payments', false),
  jsonb_build_object('target_email', profile.email, 'source', 'explicit_management_request')
from public.profiles profile
where lower(coalesce(profile.email, '')) in ('jmisantonis@gmail.com', 'kfaraci93@gmail.com');

commit;

