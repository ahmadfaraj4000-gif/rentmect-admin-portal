begin;

-- Aggregate financial totals are management-only. This exact-email branch is
-- evaluated before staff role or permission overrides so no owner, manager,
-- or employee account can inherit access accidentally.
create or replace function public.rentmect_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_permission_key = 'dashboard.financial_summary' then
      lower(coalesce(profile.email, '')) = 'anconamgt@aol.com'
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
revoke all on function public.rentmect_has_permission(text) from public, anon;
grant execute on function public.rentmect_has_permission(text) to authenticated;

-- Keep the staff context aligned with the server authorization result. The
-- dashboard RPC already reads dashboard.financial_summary through
-- rentmect_has_permission, so its month revenue and deposit totals remain null
-- for every account except the one named above.
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
          when permission.permission_key = 'dashboard.financial_summary' then
            lower(coalesce(profile.email, '')) = 'anconamgt@aol.com'
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
revoke all on function public.get_admin_staff_context() from public, anon;
grant execute on function public.get_admin_staff_context() to authenticated;

insert into public.admin_audit_logs (
  actor_user_id, actor_email, actor_role, action, entity_type, entity_id,
  changed_fields, new_values, metadata
) values (
  null,
  'support-maintenance',
  'system',
  'financial_summary_access.restricted',
  'access_control',
  'dashboard.financial_summary',
  array['authorized_email'],
  jsonb_build_object('authorized_email', 'anconamgt@aol.com'),
  jsonb_build_object('source', 'explicit_management_request')
);

commit;
