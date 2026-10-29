begin;

-- Preserve the existing detail payload and its invoker/RLS authorization.
-- Bound each request to one page; no financial or customer data is cached globally.
create or replace function public.admin_rental_details(p_rental_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_admin() or not coalesce(public.rentmect_has_permission('tab.rentals'),false) then
    raise exception 'Rental access is required.' using errcode='42501';
  end if;
  if p_rental_ids is null or cardinality(p_rental_ids)>25 or array_position(p_rental_ids,null) is not null then
    raise exception 'A rental detail request must contain at most 25 rental IDs.';
  end if;
  if cardinality(p_rental_ids)<>(select count(distinct id) from unnest(p_rental_ids) ids(id)) then
    raise exception 'Rental IDs must be unique.';
  end if;
  select coalesce(jsonb_agg(public.admin_rental_detail(id) order by position),'[]'::jsonb)
    into result from unnest(p_rental_ids) with ordinality ids(id,position);
  return result;
end; $$;
revoke all on function public.admin_rental_details(uuid[]) from public,anon;
grant execute on function public.admin_rental_details(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
