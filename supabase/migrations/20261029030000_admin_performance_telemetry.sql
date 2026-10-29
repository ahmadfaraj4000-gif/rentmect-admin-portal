begin;
set local lock_timeout = '2s';

-- Separate, bounded operational telemetry; no rental/customer/payment records.
create table public.admin_performance_samples (
  id uuid primary key,
  recorded_at timestamptz not null default clock_timestamp(),
  action text not null check (action in ('rental_list','rental_archive','rental_detail','payment_totals')),
  mode text not null check (mode in ('initial','navigation','filter','search','load_more','refresh','background')),
  cache text not null check (cache in ('network','cache','mixed')),
  outcome text not null check (outcome in ('success','error','timeout','cancelled','hidden')),
  duration_ms integer not null check (duration_ms between 0 and 120000),
  device text not null check (device in ('mobile','desktop')),
  release text not null check (release = 'local' or release ~ '^[a-f0-9]{7,40}$')
);
create index admin_performance_samples_recorded_idx on public.admin_performance_samples(recorded_at);
create table public.admin_performance_budget (
  day date primary key,
  reserved integer not null check (reserved between 0 and 5000),
  rejected bigint not null default 0
);
create table public.admin_performance_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into public.admin_performance_control(singleton) values(true);

alter table public.admin_performance_samples enable row level security;
alter table public.admin_performance_budget enable row level security;
alter table public.admin_performance_control enable row level security;
revoke all on public.admin_performance_samples, public.admin_performance_budget, public.admin_performance_control from public, anon, authenticated;

create function public.admin_record_performance(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
set statement_timeout = '2s' set lock_timeout = '150ms' as $$
declare
  enabled_now boolean;
  today date := (now() at time zone 'UTC')::date;
  requested integer;
  allowed integer;
  used integer;
  inserted integer;
  new_day boolean;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Staff access is required.' using errcode='42501';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or octet_length(p_events::text) > 12000 then
    raise exception 'Invalid performance batch.';
  end if;
  requested := jsonb_array_length(p_events);
  if requested > 20 then raise exception 'At most 20 measurements per batch.'; end if;
  if exists(select 1 from jsonb_array_elements(p_events) e where jsonb_typeof(e) <> 'object') then
    raise exception 'Invalid performance measurement.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_events) e, lateral jsonb_object_keys(e) k
    where k not in ('id','action','mode','cache','outcome','duration_ms','device','release')) then
    raise exception 'Unexpected performance field.';
  end if;
  -- Cast/validate before reserving capacity. Table constraints validate enums.
  if exists(select 1 from jsonb_to_recordset(p_events) as e(id uuid, action text, mode text, cache text, outcome text, duration_ms integer, device text, release text)
    where id is null or action is null or mode is null or cache is null or outcome is null or duration_ms is null or device is null or release is null) then
    raise exception 'Incomplete performance measurement.';
  end if;
  select c.enabled into enabled_now from public.admin_performance_control c where singleton;
  if not enabled_now or requested = 0 then return jsonb_build_object('accepted',0,'enabled',enabled_now); end if;

  insert into public.admin_performance_budget(day,reserved) values(today,0) on conflict do nothing;
  new_day := found;
  if new_day then
    -- Fallback retention even if the hourly cleanup is delayed. At most eight
    -- daily allocations can remain after intake: <=40,000 small rows.
    delete from public.admin_performance_samples where recorded_at < now() - interval '7 days';
    delete from public.admin_performance_budget where day < today - 7;
  end if;
  select reserved into used from public.admin_performance_budget where day=today for update;
  allowed := least(requested, 5000 - used);
  update public.admin_performance_budget set reserved=reserved+allowed, rejected=rejected+requested-allowed where day=today;
  insert into public.admin_performance_samples(id,action,mode,cache,outcome,duration_ms,device,release)
    select id,action,mode,cache,outcome,duration_ms,device,release
    from jsonb_to_recordset(p_events) as e(id uuid, action text, mode text, cache text, outcome text, duration_ms integer, device text, release text)
    limit allowed
    on conflict(id) do nothing;
  get diagnostics inserted = row_count;
  return jsonb_build_object('accepted',inserted,'enabled',true);
end; $$;

create function public.admin_performance_set_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public
set statement_timeout = '2s' set lock_timeout = '150ms' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false)
    or not coalesce(public.rentmect_has_permission('tab.settings'),false)
    or not coalesce(public.rentmect_has_permission('settings.operational'),false) then
    raise exception 'Operational settings access is required.' using errcode='42501';
  end if;
  if p_enabled is null then raise exception 'Collection state is required.'; end if;
  update public.admin_performance_control set enabled=p_enabled where singleton;
end; $$;

create function public.admin_performance_report(p_hours integer default 24, p_device text default 'all', p_cache text default 'all', p_mode text default 'foreground')
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
set statement_timeout = '3s' as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) or not coalesce(public.rentmect_has_permission('tab.settings'),false) then
    raise exception 'Settings access is required.' using errcode='42501';
  end if;
  if p_hours is null or p_hours not in (24,168) or p_device is null or p_device not in ('all','mobile','desktop')
    or p_cache is null or p_cache not in ('all','network','cache','mixed') or p_mode is null
    or p_mode not in ('foreground','initial','navigation','filter','search','load_more','refresh','background') then
    raise exception 'Invalid performance report filter.';
  end if;
  with observations as materialized (
    select *, case action when 'rental_detail' then 1000 when 'payment_totals' then 2000 else 1500 end as target_ms,
      (recorded_at at time zone 'America/New_York')::date as local_day
    from public.admin_performance_samples
    where recorded_at >= now() - make_interval(hours=>p_hours)
      and (p_device='all' or device=p_device) and (p_cache='all' or cache=p_cache)
      and (case when p_mode='foreground' then mode<>'background' else mode=p_mode end)
  ), grouped as (
    select action, local_day, release,
      case when grouping(local_day)=0 then 'day' when grouping(release)=0 then 'release' else 'action' end as kind,
      max(target_ms) as target_ms, count(*) as observations,
      count(*) filter(where outcome='success') as successes,
      count(*) filter(where outcome='error') as errors,
      count(*) filter(where outcome='timeout') as timeouts,
      count(*) filter(where outcome='cancelled') as cancelled,
      count(*) filter(where outcome='hidden') as hidden,
      count(*) filter(where outcome='success' and duration_ms<=target_ms) as within_target,
      percentile_cont(array[0.5,0.95,0.99]) within group(order by duration_ms) filter(where outcome='success') as latency_ms
    from observations
    group by grouping sets ((action), (action,local_day), (action,release))
  ) select jsonb_build_object(
    'generated_at',now(), 'hours',p_hours,
    'enabled',(select enabled from public.admin_performance_control where singleton),
    'last_received_at',(select max(recorded_at) from public.admin_performance_samples),
    'retention_days',7, 'daily_limit',5000,
    'limited_days',(select coalesce(jsonb_agg(day order by day),'[]'::jsonb) from public.admin_performance_budget where rejected>0 and day >= (now() at time zone 'UTC')::date-7),
    'groups',coalesce((select jsonb_agg(to_jsonb(g) order by kind,action,local_day,release) from grouped g
      where kind<>'release' or release in (select o.release from observations o group by o.release order by max(o.recorded_at) desc limit 5)),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create function public.admin_performance_cleanup()
returns void language plpgsql security definer set search_path = pg_catalog, public
set statement_timeout = '3s' set lock_timeout = '150ms' as $$
begin
  delete from public.admin_performance_samples where recorded_at < now() - interval '7 days';
  delete from public.admin_performance_budget where day < (now() at time zone 'UTC')::date - 7;
end; $$;

revoke all on function public.admin_record_performance(jsonb), public.admin_performance_report(integer,text,text,text), public.admin_performance_set_enabled(boolean), public.admin_performance_cleanup() from public, anon, authenticated;
grant execute on function public.admin_record_performance(jsonb), public.admin_performance_report(integer,text,text,text), public.admin_performance_set_enabled(boolean) to authenticated;
select cron.schedule('admin-performance-retention', '17 * * * *', 'select public.admin_performance_cleanup()');
notify pgrst,'reload schema';
commit;
