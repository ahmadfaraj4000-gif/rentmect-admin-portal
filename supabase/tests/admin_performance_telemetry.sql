-- Run only in a rollback transaction after applying the migration to that
-- transaction. Harness sets request.jwt.claim.sub to authorized staff and
-- test.customer_id to an existing non-staff subject. No financial rows change.
do $test$
declare payload jsonb; response jsonb; report jsonb; row jsonb; actor text:=auth.uid()::text;
begin
  if has_function_privilege('anon','public.admin_record_performance(jsonb)','execute')
    or has_function_privilege('anon','public.admin_performance_report(integer,text,text,text)','execute')
    or has_function_privilege('authenticated','public.admin_performance_cleanup()','execute') then
    raise exception 'Unexpected function access';
  end if;
  if has_table_privilege('authenticated','public.admin_performance_samples','select')
    or has_table_privilege('authenticated','public.admin_performance_samples','insert') then raise exception 'Raw data access'; end if;
  for n in 0..4 loop
    select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'action','rental_list','mode','navigation','cache','network',
      'outcome','success','duration_ms',i,'device','desktop','release',case when i<=50 then 'aaaaaaa' else 'bbbbbbb' end))
      into payload from generate_series(n*20+1,n*20+20) i;
    response:=public.admin_record_performance(payload);
    if (response->>'accepted')::int<>20 then raise exception 'Batch not accepted';end if;
  end loop;
  response:=public.admin_record_performance(payload);
  if (response->>'accepted')::int<>0 then raise exception 'Duplicate measurements inserted';end if;
  select g into row from jsonb_array_elements(public.admin_performance_report()->'groups') g where g->>'kind'='action' and g->>'action'='rental_list';
  if (row->>'successes')::int<>100 or abs((row->'latency_ms'->>1)::numeric-95.05)>0.001 then
    raise exception 'Incorrect global percentile: %',row;
  end if;
  payload:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'action','rental_list','mode','navigation','cache','network',
    'outcome','timeout','duration_ms',120000,'device','desktop','release','bbbbbbb'));
  perform public.admin_record_performance(payload);
  select g into row from jsonb_array_elements(public.admin_performance_report()->'groups') g where g->>'kind'='action';
  if (row->>'timeouts')::int<>1 or abs((row->'latency_ms'->>1)::numeric-95.05)>0.001 then raise exception 'Failure corrupted latency';end if;
  if jsonb_array_length(public.admin_performance_report(24,'mobile')->'groups')<>0 then raise exception 'Device filter';end if;
  if jsonb_array_length(public.admin_performance_report(24,'all','cache')->'groups')<>0 then raise exception 'Cache filter';end if;
  if jsonb_array_length(public.admin_performance_report(24,'all','all','background')->'groups')<>0 then raise exception 'Mode filter';end if;
  begin perform public.admin_record_performance(payload || jsonb_build_array(jsonb_build_object('email','private@example.test')));raise exception 'FAILED privacy allowlist';
    exception when others then if sqlerrm<>'Unexpected performance field.' then raise;end if;end;
  begin perform public.admin_record_performance((select jsonb_agg(payload->0) from generate_series(1,21)));raise exception 'FAILED batch bound';
    exception when others then if sqlerrm<>'At most 20 measurements per batch.' then raise;end if;end;
  begin perform public.admin_performance_report(1000);raise exception 'FAILED report window';
    exception when others then if sqlerrm<>'Invalid performance report filter.' then raise;end if;end;
  perform public.admin_performance_set_enabled(false);
  if (public.admin_record_performance(payload)->>'enabled')::boolean then raise exception 'Pause ignored';end if;
  perform public.admin_performance_set_enabled(true);
  perform set_config('request.jwt.claim.sub',current_setting('test.customer_id'),true);
  begin perform public.admin_record_performance(payload);raise exception 'FAILED customer ingest';exception when insufficient_privilege then null;end;
  begin perform public.admin_performance_report();raise exception 'FAILED customer report';exception when insufficient_privilege then null;end;
  begin perform public.admin_performance_set_enabled(false);raise exception 'FAILED customer control';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.admin_record_performance(payload);raise exception 'FAILED unauthenticated ingest';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',actor,true);
end;$test$;

reset role;
do $test$
declare response jsonb; payload jsonb;
begin
  update public.admin_performance_budget set reserved=4999 where day=(now() at time zone 'UTC')::date;
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'action','rental_archive','mode','filter','cache','cache',
    'outcome','success','duration_ms',100,'device','desktop','release','bbbbbbb')) into payload from generate_series(1,20);
  response:=public.admin_record_performance(payload);
  if (response->>'accepted')::int<>1 then raise exception 'Daily limit not enforced';end if;
  response:=public.admin_record_performance(payload);
  if (response->>'accepted')::int<>0 then raise exception 'Daily limit exceeded';end if;
  insert into public.admin_performance_samples(id,recorded_at,action,mode,cache,outcome,duration_ms,device,release)
    values(gen_random_uuid(),now()-interval '8 days','rental_list','initial','network','success',100,'desktop','bbbbbbb');
  perform public.admin_performance_cleanup();
  if exists(select 1 from public.admin_performance_samples where recorded_at<now()-interval '7 days') then raise exception 'Retention failed';end if;
end;$test$;
