-- Cache row-independent identity checks once per statement.
-- Keep every existing policy predicate, role, restrictive flag and WITH CHECK unchanged.
-- No row-dependent permission helper is cached or bypassed.
begin;
set local lock_timeout = '2s';
alter policy "Admins can read all profiles" on public."profiles" using ((select public.is_admin()));
alter policy "Profiles are visible to owner or admins" on public."profiles" using (((id = (select auth.uid())) OR (select public.is_admin())));
alter policy "Users can read own profile" on public."profiles" using ((id = (select auth.uid())));
alter policy "Users can view own profile" on public."profiles" using (((select auth.uid()) = id));
alter policy "Admins manage rental charges" on public."rental_charge_items" using ((select public.is_admin()));
alter policy "Customers read their rental charges" on public."rental_charge_items" using (((user_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "Admins can read deposit allocations" on public."rental_deposit_allocations" using ((select public.is_admin()));
alter policy "Admins can manage rental document rows" on public."rental_documents" using ((select public.is_admin()));
alter policy "Admins can read all rental documents" on public."rental_documents" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.role = 'admin'::text)))));
alter policy "Customers can read their rental document rows" on public."rental_documents" using (((user_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "Users can view own documents" on public."rental_documents" using (((select auth.uid()) = user_id));
alter policy "Admins can read emergency exceptions" on public."rental_emergency_exceptions" using ((select public.is_admin()));
alter policy "Admins can manage extension requests" on public."rental_extension_requests" using ((select public.is_admin()));
alter policy "Customers can read their extension requests" on public."rental_extension_requests" using (((user_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "Admins can read rental payment refunds" on public."rental_payment_refunds" using ((select public.is_admin()));
alter policy "Admins can read rental step completions" on public."rental_step_completions" using ((select public.is_admin()));
alter policy "Customers can read their rentals" on public."rentals" using (((user_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "Admins can manage vehicle reports" on public."vehicle_reports" using ((select public.is_admin()));
alter policy "Customers can read their vehicle reports" on public."vehicle_reports" using ((user_id = (select auth.uid())));
alter policy "Users can view own reports" on public."vehicle_reports" using (((select auth.uid()) = user_id));
alter policy "Admins can manage vehicles" on public."vehicles" using ((select public.is_admin()));
commit;
