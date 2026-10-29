-- Run in a rollback transaction with an authorized staff JWT subject and
-- test.denied_subject / test.other_admin set by the deployment harness.
do $test$
declare actor text:=auth.uid()::text; report jsonb;
begin
  if has_function_privilege('anon','public.admin_payment_revenue_snapshot()','execute') then raise exception 'Anonymous access granted';end if;
  if (select prosecdef from pg_proc where oid='public.admin_payment_revenue_snapshot()'::regprocedure) then raise exception 'Snapshot bypasses RLS';end if;
  report:=public.admin_payment_revenue_snapshot();
  if (select count(*) from jsonb_each(report))<>8 then raise exception 'Missing revenue sources';end if;
  if exists(select 1 from jsonb_each(report) entry where jsonb_typeof(entry.value)<>'array') then raise exception 'Incomplete snapshot';end if;
  perform set_config('request.jwt.claim.sub',current_setting('test.denied_subject'),true);
  begin perform public.admin_payment_revenue_snapshot();raise exception 'FAILED customer authorization';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',current_setting('test.other_admin'),true);
  begin perform public.admin_payment_revenue_snapshot();raise exception 'FAILED account restriction';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.admin_payment_revenue_snapshot();raise exception 'FAILED signed-out authorization';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',actor,true);
end;$test$;
