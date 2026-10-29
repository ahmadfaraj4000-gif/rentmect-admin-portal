-- Run within a transaction as authenticated with an authorized staff subject.
do $test$
declare ids uuid[]; batch jsonb; expected jsonb; actor text:=auth.uid()::text;
begin
  select array_agg(id order by created_at desc,id desc) into ids from (select id,created_at from public.rentals order by created_at desc,id desc limit 25) r;
  batch:=public.admin_rental_details(ids);
  select jsonb_agg(public.admin_rental_detail(id) order by position) into expected from unnest(ids) with ordinality x(id,position);
  -- Some existing detail aggregates (e.g. steps) have no ORDER BY. Compare
  -- every row value while allowing those child arrays to arrive in any order.
  if exists (
    select 1 from generate_series(0,cardinality(ids)-1) n(i), lateral jsonb_each(expected->i) e
    where case when jsonb_typeof(e.value)='array' then
      (select coalesce(jsonb_agg(v order by v::text),'[]') from jsonb_array_elements(e.value) a(v))
        is distinct from
      (select coalesce(jsonb_agg(v order by v::text),'[]') from jsonb_array_elements(batch->i->e.key) a(v))
    else e.value is distinct from batch->i->e.key end
  ) or jsonb_array_length(batch)<>cardinality(ids) then raise exception 'Batch changed detail payloads'; end if;
  if public.admin_rental_details(array[]::uuid[])<>'[]'::jsonb then raise exception 'Empty batch'; end if;
  begin
    perform public.admin_rental_details(array_fill(ids[1],array[26]));raise exception 'FAILED batch limit';
  exception when others then if sqlerrm not like 'A rental detail request%' then raise; end if;end;
  begin
    perform public.admin_rental_details(array[ids[1],ids[1]]);raise exception 'FAILED duplicate check';
  exception when others then if sqlerrm<>'Rental IDs must be unique.' then raise;end if;end;
  begin
    perform public.admin_rental_details(array[null]::uuid[]);raise exception 'FAILED null check';
  exception when others then if sqlerrm not like 'A rental detail request%' then raise;end if;end;
  if (select prosecdef from pg_proc where oid='public.admin_rental_details(uuid[])'::regprocedure) then raise exception 'Batch bypasses RLS';end if;
  if has_function_privilege('anon','public.admin_rental_details(uuid[])','EXECUTE') then raise exception 'Anonymous grant';end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.admin_rental_details(ids);raise exception 'FAILED authorization';
  exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',actor,true);
end;$test$;
