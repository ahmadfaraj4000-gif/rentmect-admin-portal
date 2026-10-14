-- One-time guarded correction. Preserves provider history; no money moves.
-- Reviewed successful refunds were confirmed as deposit returns by the user.
-- Temporary trigger bodies are restored within this same transaction.
begin;
set local lock_timeout='2s';
set local statement_timeout='20s';
do $guard$ begin
if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rentmect_rental_net_paid_amount') <> 'c4f2d374ad6cb2df61d26601a8c277f5' then raise exception 'Live function changed: rentmect_rental_net_paid_amount'; end if;
if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='prepare_before_pickup_deposit_refund') <> '762af92eaab32b87085837cfd794ee6f' then raise exception 'Live function changed: prepare_before_pickup_deposit_refund'; end if;
if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_security_deposit_refund_email') <> '3be01d31601055ba478a17653f1499d0' then raise exception 'Live function changed: queue_security_deposit_refund_email'; end if;
if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='capture_deposit_refund_transition') <> '4ec55c65eae7cb79c168cec6452d0b26' then raise exception 'Live function changed: capture_deposit_refund_transition'; end if;
if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_stripe_deposit_refund') <> '0f6f54b5e91bb9ef0055c02b515daacb' then raise exception 'Live function changed: apply_stripe_deposit_refund'; end if;
if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='refresh_rental_deposit_summary') <> 'c3214abb8031d71c8d329de449fbf53b' then raise exception 'Live function changed: refresh_rental_deposit_summary'; end if;
end $guard$;
-- Deposit returns remain in the provider ledger, but do not reduce rental receipts.
CREATE OR REPLACE FUNCTION public.rentmect_rental_net_paid_amount(p_rental_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.rentals%rowtype; initial_paid numeric:=0; balance_paid numeric; extensions_paid numeric;
  refunds numeric; external_refunds numeric; deposit_refunds numeric:=0;
begin
  select * into r from public.rentals where id=p_rental_id;
  if not found then return 0; end if;
  if r.paid_at is not null then initial_paid:=greatest(0,coalesce(r.payment_amount_cents,0)/100.0); end if;
  select coalesce(sum(coalesce(payment_amount_cents,round(total_amount*100)::integer))/100.0,0) into balance_paid
    from public.rental_charge_items where rental_id=r.id and charge_type='rental_amendment' and status='paid';
  select coalesce(sum(coalesce(payment_amount_cents/100.0,extension_total_amount)),0) into extensions_paid
    from public.rental_extension_requests where rental_id=r.id and request_kind='same_vehicle_extension' and status='activated' and payment_status='paid';
  select coalesce(sum(f.amount),0) into refunds from public.rental_payment_refunds f where f.rental_id=r.id
    and f.source_type <> 'security_deposit' and f.status in ('processing','pending','succeeded') and (f.extension_request_id is null or exists(
      select 1 from public.rental_extension_requests e where e.id=f.extension_request_id and e.rental_id=r.id and e.request_kind='same_vehicle_extension'));
  select coalesce(sum(amount),0) into external_refunds from public.rental_external_payment_actions where rental_id=r.id and action_type='refund';
  if r.cancelled_before_pickup_at is not null then deposit_refunds:=coalesce(r.deposit_released_amount,0); end if;
  return greatest(0,round(initial_paid+balance_paid+extensions_paid-refunds-external_refunds-deposit_refunds+(select coalesce(sum(d.amount),0)
  from public.rental_deposit_charge_applications d join public.rental_charge_items c on c.id=d.charge_id
  where d.rental_id=r.id and c.charge_type='rental_amendment')+case when r.deposit_source_rental_id is not null then coalesce(r.deposit_carried_amount,0) else 0 end,2));
end; $function$
;
CREATE OR REPLACE FUNCTION public.prepare_before_pickup_deposit_refund(p_rental_id uuid, p_actor_id uuid, p_reason text)
 RETURNS rentals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.rentals%rowtype;
  v_held numeric;
  v_refunded numeric;
  v_blockers jsonb;
begin
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Enter a cancellation reason of at least 5 characters.'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role='admin') then
    raise exception 'Admin access is required.';
  end if;
  select * into r from public.rentals where id=p_rental_id for update;
  if not found then raise exception 'Rental not found.'; end if;
  if r.status='cancelled' and r.cancelled_before_pickup_at is not null then return r; end if;
  if r.status not in ('pending','documents_needed','document_review','ready_for_pickup','approved')
     or r.starting_mileage is not null or r.ending_mileage is not null then
    raise exception 'This action is only for a reservation cancelled before vehicle pickup.';
  end if;
  if r.payment_provider is distinct from 'stripe' or r.paid_at is null or r.payment_status <> 'paid' then
    raise exception 'This workflow requires a captured Stripe booking payment.';
  end if;
  if r.deposit_source_rental_id is not null or exists(
    select 1 from public.rentals where deposit_source_rental_id=r.id
  ) then raise exception 'This deposit protects a continuation booking. Resolve the continuation chain first.'; end if;
  perform 1 from public.rental_deposit_allocations
    where holder_rental_id=r.id or source_rental_id=r.id for update;
  if exists(select 1 from public.rental_deposit_allocations
    where (holder_rental_id=r.id or source_rental_id=r.id) and (
      holder_rental_id<>r.id or source_rental_id<>r.id or payment_provider<>'stripe'
      or stripe_payment_intent_id is distinct from r.stripe_payment_intent_id
      or status not in ('held','failed','refund_due_inspection'))) then
    raise exception 'Resolve the existing deposit allocation or refund before cancelling.';
  end if;
  select coalesce(sum(greatest(0,amount_held-amount_released)),0) into v_held
    from public.rental_deposit_allocations where holder_rental_id=r.id;
  if v_held <= 0 then raise exception 'No held Stripe deposit was found.'; end if;
  if exists(select 1 from public.rental_payment_refunds where rental_id=r.id
    and status in ('processing','pending')) then
    raise exception 'Wait for the existing rental refund to finish before cancelling.';
  end if;
  select coalesce(sum(amount),0) into v_refunded from public.rental_payment_refunds
    where rental_id=r.id and source_type <> 'security_deposit' and extension_request_id is null and status='succeeded';
  if abs(coalesce(r.payment_amount_cents,0)/100.0-v_refunded-v_held) > 0.005 then
    raise exception 'Refund the rental payment first using Refund. This action returns only the remaining security deposit.';
  end if;
  if exists(select 1 from public.rental_charge_items where rental_id=r.id and
    status not in ('waived','cancelled') and not (
      source_type='rental_balance' and charge_type='rental_amendment' and status in ('pending','failed'))) then
    raise exception 'Resolve additional charges and payment attempts before cancelling.';
  end if;
  if exists(select 1 from public.rental_extension_requests where rental_id=r.id
    and status not in ('cancelled','rejected','expired')) then
    raise exception 'Resolve the extension request before cancelling.';
  end if;
  -- Waive only the system balance created when the rental payment was refunded.
  -- Any later failure rolls this change back with the whole transaction.
  update public.rental_charge_items set status='waived', updated_at=now(),
    description='Rental cancelled before pickup; original invoice credited.'
    where rental_id=r.id and source_type='rental_balance'
      and charge_type='rental_amendment' and status in ('pending','failed');
  select coalesce(jsonb_agg(b), '[]'::jsonb) into v_blockers
    from jsonb_array_elements(public.rentmect_deposit_chain_release_blockers(r.id)) b
    where not (b->>'rental_id'=r.id::text and b->>'type' in ('rental_not_completed','inspection_incomplete'));
  if jsonb_array_length(v_blockers)>0 then
    raise exception 'Resolve deposit blockers before cancelling: %', v_blockers;
  end if;
  update public.rentals set status='cancelled', cancelled_at=now(), cancelled_by=p_actor_id,
    cancellation_reason=trim(p_reason), cancelled_before_pickup_at=now(),
    cancellation_credit_amount=round(coalesce(rental_total,0)+coalesce(service_fee_total,0)
      +coalesce(tax_amount,0)+coalesce(security_deposit,0),2),
    deposit_release_due_at=null, updated_at=now()
    where id=r.id returning * into r;
  update public.vehicles set status='available' where id=r.vehicle_id and status='reserved'
    and not exists(select 1 from public.rentals other where other.vehicle_id=r.vehicle_id
      and other.id<>r.id and other.status not in ('cancelled','completed'));
  insert into public.rental_audit_events(rental_id,user_id,actor_id,event_type,event_payload)
    values(r.id,r.user_id,p_actor_id,'admin_cancelled_before_pickup',jsonb_build_object(
      'reason',trim(p_reason),'cancellation_credit',r.cancellation_credit_amount,
      'deposit_refund_due',v_held,'rental_refunds_already_succeeded',v_refunded));
  return r;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.queue_security_deposit_refund_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin return new; end; $function$;
CREATE OR REPLACE FUNCTION public.capture_deposit_refund_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP='UPDATE' then
    -- A replayed pending webhook cannot undo a completed refund.
    if old.status='released' and old.refund_id is not null
       and new.refund_id=old.refund_id then
      new.status:=old.status;
      new.amount_released:=old.amount_released;
      new.last_error:=old.last_error;
    end if;
    if new.external_receipt_refunded_amount<old.external_receipt_refunded_amount then
      raise exception 'An external receipt refund attribution cannot be removed by an ordinary update.';
    end if;
    if new.amount_released<old.amount_released then
      raise exception 'A recorded deposit return cannot be reduced by an ordinary update.';
    end if;
    new.refund_requested_at:=old.refund_requested_at;
    new.refund_completed_at:=old.refund_completed_at;
    if ((new.refund_id is not null and new.refund_id is distinct from old.refund_id)
        or (new.status='release_pending' and new.status is distinct from old.status) or new.amount_released>old.amount_released)
      and new.refund_requested_at is null then new.refund_requested_at:=coalesce((select f.created_at from public.rental_payment_refunds f where f.stripe_refund_id=new.refund_id and f.source_type='security_deposit' and f.status='succeeded' and f.amount=new.amount_released and f.stripe_payment_intent_id=new.stripe_payment_intent_id),now()); end if;
    if new.amount_released>old.amount_released then new.refund_completed_at:=coalesce((select f.created_at from public.rental_payment_refunds f where f.stripe_refund_id=new.refund_id and f.source_type='security_deposit' and f.status='succeeded' and f.amount=new.amount_released and f.stripe_payment_intent_id=new.stripe_payment_intent_id),now()); end if;
  else
    if new.refund_id is not null or new.status='release_pending' or new.amount_released>0 then
      new.refund_requested_at:=coalesce(new.refund_requested_at,now());
    end if;
    if new.amount_released>0 then new.refund_completed_at:=coalesce(new.refund_completed_at,now()); end if;
  end if;
  return new;
end;
$function$
;
do $repair$
declare x record; f public.rental_payment_refunds%rowtype; a public.rental_deposit_allocations%rowtype;
 r public.rentals%rowtype; i public.stripe_reconciliation_issues%rowtype; c public.rental_charge_items%rowtype;
 old_paid numeric; emails bigint; refund_count bigint;
begin
 select count(*) into emails from public.email_outbox;
 select count(*) into refund_count from public.rental_payment_refunds;
 for x in select * from (values
 ('b34f74ac-367a-41c4-9dfa-2d43ce316640'::uuid,'280278f8-507f-44fa-a9bc-afb3cdf5e576'::uuid,'c29e2c62-c37e-4abe-85d3-3c3755ac7ae5'::uuid,'78eeeb83-b52e-4ca0-a308-0be30d7e02d6'::uuid,400::numeric),
 ('e5e38784-7d44-41b3-ac6b-f3ca8feab6b4'::uuid,'f7b4dd55-4941-4166-8532-bf11db38e6f1'::uuid,'6cbb8729-2c87-4e8c-a58a-2273b2a6e512'::uuid,'34ecf75a-6172-4607-a583-5d8ba3d2ec65'::uuid,300::numeric)
 ) v(refund_id,allocation_id,issue_id,charge_id,amount) loop
 select * into strict f from public.rental_payment_refunds where id=x.refund_id for update;
 perform pg_advisory_xact_lock(hashtextextended(f.stripe_payment_intent_id,0));
 select * into strict r from public.rentals where id=f.rental_id for update;
 select * into strict a from public.rental_deposit_allocations where id=x.allocation_id for update;
 select * into strict i from public.stripe_reconciliation_issues where id=x.issue_id for update;
 select * into strict c from public.rental_charge_items where id=x.charge_id for update;
 if f.status<>'succeeded' or f.source_type<>'stripe_manual_review' or f.amount<>x.amount or f.currency<>'usd'
 or i.status<>'open' or i.issue_type<>'manual_refund_review' or i.refund_id is distinct from f.stripe_refund_id
 or i.payment_intent_id is distinct from f.stripe_payment_intent_id or i.amount<>f.amount or i.rental_id<>r.id
 or a.holder_rental_id<>r.id or a.source_rental_id<>r.id or a.status<>'held' or a.amount_held<>x.amount
 or a.amount_applied<>0 or a.amount_released<>0 or a.refund_id is not null or a.refund_reserved_amount is not null
 or a.payment_provider<>'stripe' or (a.stripe_payment_intent_id is not null and a.stripe_payment_intent_id<>f.stripe_payment_intent_id)
 or c.rental_id<>r.id or c.status<>'paid' or c.stripe_payment_intent_id is distinct from f.stripe_payment_intent_id
 or c.payment_amount_cents<x.amount*100 or r.status<>'completed' or r.deposit_held_amount<>x.amount or r.deposit_released_amount<>0
 then raise exception 'Refund/allocation evidence changed for %',x.refund_id; end if;
 old_paid:=public.rentmect_rental_net_paid_amount(r.id);
 update public.rental_payment_refunds set source_type='security_deposit',
 reason='Security-deposit return; classification confirmed by account representative on 2026-10-14. Original Stripe refund preserved.',updated_at=now() where id=f.id;
 update public.rental_deposit_allocations set stripe_payment_intent_id=f.stripe_payment_intent_id where id=a.id;
 perform public.apply_stripe_deposit_refund(r.id,a.id,f.stripe_refund_id,f.stripe_payment_intent_id,'succeeded',f.amount,null);
 update public.stripe_reconciliation_issues set status='resolved',resolved_at=now(),updated_at=now(),error_message=null,
 payload=payload||jsonb_build_object('classification','security_deposit','confirmed_on','2026-10-14','money_moved',false,'refund_ledger_id',f.id,'deposit_allocation_id',a.id)
 where id=i.id;
 insert into public.rental_audit_events(rental_id,user_id,event_type,event_payload)
 values(r.id,r.user_id,'manual_stripe_refund_classified',jsonb_build_object('classification','security_deposit',
 'confirmation','Account representative confirmed both refunds were security-deposit returns on 2026-10-14.',
 'refund_before',to_jsonb(f),'allocation_before',to_jsonb(a),'reconciliation_before',to_jsonb(i),
 'rental_before',to_jsonb(r),'money_moved',false,'customer_message_sent',false));
 if public.rentmect_rental_net_paid_amount(r.id)<>old_paid+x.amount then raise exception 'Rental receipt correction mismatch'; end if;
 if not exists(select 1 from public.rental_deposit_allocations where id=a.id and status='released' and amount_released=x.amount and refund_completed_at=f.created_at)
 or not exists(select 1 from public.rentals where id=r.id and deposit_status='released' and deposit_held_amount=0 and deposit_released_amount=x.amount)
 then raise exception 'Deposit summary/date mismatch'; end if;
 end loop;
 if (select count(*) from public.email_outbox)<>emails then raise exception 'Unexpected email queued'; end if;
 if (select count(*) from public.rental_payment_refunds)<>refund_count then raise exception 'Refund history changed'; end if;
end $repair$;
set constraints all immediate;

CREATE OR REPLACE FUNCTION public.queue_security_deposit_refund_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_template public.email_templates%rowtype;
  v_profile public.profiles%rowtype;
  v_vehicle public.vehicles%rowtype;
begin
  if lower(coalesce(new.deposit_status, '')) <> 'released'
     or lower(coalesce(old.deposit_status, '')) = 'released' then
    return new;
  end if;

  select * into v_template from public.email_templates
  where template_key = 'security_deposit_refunded' and enabled limit 1;
  if not found then return new; end if;

  select * into v_profile from public.profiles where id = new.user_id;
  select * into v_vehicle from public.vehicles where id = new.vehicle_id;
  if nullif(trim(coalesce(v_profile.email, '')), '') is null then return new; end if;

  insert into public.email_outbox (
    event_key, email_type, template_id, rental_id, user_id,
    recipient_email, recipient_name, payload
  ) values (
    'security_deposit_refunded:' || new.id::text,
    'security_deposit_refunded', v_template.id, new.id, new.user_id,
    lower(trim(v_profile.email)), v_profile.full_name,
    jsonb_build_object(
      'customer_name', coalesce(v_profile.full_name, 'Customer'),
      'customer_first_name', split_part(coalesce(v_profile.full_name, 'Customer'), ' ', 1),
      'vehicle_name', coalesce(v_vehicle.name, 'your rental vehicle'),
      'refund_amount', to_char(coalesce(new.deposit_released_amount, new.security_deposit, 0), 'FM$999,999,990.00'),
      'refund_reference', coalesce(nullif(new.deposit_refund_id, ''), 'Available from Rent Me CT'),
      'manage_booking_url', 'https://login.rentmect.com'
    )
  ) on conflict (event_key) do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.capture_deposit_refund_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP='UPDATE' then
    -- A replayed pending webhook cannot undo a completed refund.
    if old.status='released' and old.refund_id is not null
       and new.refund_id=old.refund_id then
      new.status:=old.status;
      new.amount_released:=old.amount_released;
      new.last_error:=old.last_error;
    end if;
    if new.external_receipt_refunded_amount<old.external_receipt_refunded_amount then
      raise exception 'An external receipt refund attribution cannot be removed by an ordinary update.';
    end if;
    if new.amount_released<old.amount_released then
      raise exception 'A recorded deposit return cannot be reduced by an ordinary update.';
    end if;
    new.refund_requested_at:=old.refund_requested_at;
    new.refund_completed_at:=old.refund_completed_at;
    if ((new.refund_id is not null and new.refund_id is distinct from old.refund_id)
        or (new.status='release_pending' and new.status is distinct from old.status) or new.amount_released>old.amount_released)
      and new.refund_requested_at is null then new.refund_requested_at:=now(); end if;
    if new.amount_released>old.amount_released then new.refund_completed_at:=now(); end if;
  else
    if new.refund_id is not null or new.status='release_pending' or new.amount_released>0 then
      new.refund_requested_at:=coalesce(new.refund_requested_at,now());
    end if;
    if new.amount_released>0 then new.refund_completed_at:=coalesce(new.refund_completed_at,now()); end if;
  end if;
  return new;
end;
$function$
;
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261014235000','classified_deposit_refunds',array['-- Deposit returns remain in the provider ledger, but do not reduce rental receipts.
CREATE OR REPLACE FUNCTION public.rentmect_rental_net_paid_amount(p_rental_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
declare r public.rentals%rowtype; initial_paid numeric:=0; balance_paid numeric; extensions_paid numeric;
  refunds numeric; external_refunds numeric; deposit_refunds numeric:=0;
begin
  select * into r from public.rentals where id=p_rental_id;
  if not found then return 0; end if;
  if r.paid_at is not null then initial_paid:=greatest(0,coalesce(r.payment_amount_cents,0)/100.0); end if;
  select coalesce(sum(coalesce(payment_amount_cents,round(total_amount*100)::integer))/100.0,0) into balance_paid
    from public.rental_charge_items where rental_id=r.id and charge_type=''rental_amendment'' and status=''paid'';
  select coalesce(sum(coalesce(payment_amount_cents/100.0,extension_total_amount)),0) into extensions_paid
    from public.rental_extension_requests where rental_id=r.id and request_kind=''same_vehicle_extension'' and status=''activated'' and payment_status=''paid'';
  select coalesce(sum(f.amount),0) into refunds from public.rental_payment_refunds f where f.rental_id=r.id
    and f.source_type <> ''security_deposit'' and f.status in (''processing'',''pending'',''succeeded'') and (f.extension_request_id is null or exists(
      select 1 from public.rental_extension_requests e where e.id=f.extension_request_id and e.rental_id=r.id and e.request_kind=''same_vehicle_extension''));
  select coalesce(sum(amount),0) into external_refunds from public.rental_external_payment_actions where rental_id=r.id and action_type=''refund'';
  if r.cancelled_before_pickup_at is not null then deposit_refunds:=coalesce(r.deposit_released_amount,0); end if;
  return greatest(0,round(initial_paid+balance_paid+extensions_paid-refunds-external_refunds-deposit_refunds+(select coalesce(sum(d.amount),0)
  from public.rental_deposit_charge_applications d join public.rental_charge_items c on c.id=d.charge_id
  where d.rental_id=r.id and c.charge_type=''rental_amendment'')+case when r.deposit_source_rental_id is not null then coalesce(r.deposit_carried_amount,0) else 0 end,2));
end; $function$
;
CREATE OR REPLACE FUNCTION public.prepare_before_pickup_deposit_refund(p_rental_id uuid, p_actor_id uuid, p_reason text)
 RETURNS rentals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
declare
  r public.rentals%rowtype;
  v_held numeric;
  v_refunded numeric;
  v_blockers jsonb;
begin
  if length(trim(coalesce(p_reason,''''))) < 5 then raise exception ''Enter a cancellation reason of at least 5 characters.''; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role=''admin'') then
    raise exception ''Admin access is required.'';
  end if;
  select * into r from public.rentals where id=p_rental_id for update;
  if not found then raise exception ''Rental not found.''; end if;
  if r.status=''cancelled'' and r.cancelled_before_pickup_at is not null then return r; end if;
  if r.status not in (''pending'',''documents_needed'',''document_review'',''ready_for_pickup'',''approved'')
     or r.starting_mileage is not null or r.ending_mileage is not null then
    raise exception ''This action is only for a reservation cancelled before vehicle pickup.'';
  end if;
  if r.payment_provider is distinct from ''stripe'' or r.paid_at is null or r.payment_status <> ''paid'' then
    raise exception ''This workflow requires a captured Stripe booking payment.'';
  end if;
  if r.deposit_source_rental_id is not null or exists(
    select 1 from public.rentals where deposit_source_rental_id=r.id
  ) then raise exception ''This deposit protects a continuation booking. Resolve the continuation chain first.''; end if;
  perform 1 from public.rental_deposit_allocations
    where holder_rental_id=r.id or source_rental_id=r.id for update;
  if exists(select 1 from public.rental_deposit_allocations
    where (holder_rental_id=r.id or source_rental_id=r.id) and (
      holder_rental_id<>r.id or source_rental_id<>r.id or payment_provider<>''stripe''
      or stripe_payment_intent_id is distinct from r.stripe_payment_intent_id
      or status not in (''held'',''failed'',''refund_due_inspection''))) then
    raise exception ''Resolve the existing deposit allocation or refund before cancelling.'';
  end if;
  select coalesce(sum(greatest(0,amount_held-amount_released)),0) into v_held
    from public.rental_deposit_allocations where holder_rental_id=r.id;
  if v_held <= 0 then raise exception ''No held Stripe deposit was found.''; end if;
  if exists(select 1 from public.rental_payment_refunds where rental_id=r.id
    and status in (''processing'',''pending'')) then
    raise exception ''Wait for the existing rental refund to finish before cancelling.'';
  end if;
  select coalesce(sum(amount),0) into v_refunded from public.rental_payment_refunds
    where rental_id=r.id and source_type <> ''security_deposit'' and extension_request_id is null and status=''succeeded'';
  if abs(coalesce(r.payment_amount_cents,0)/100.0-v_refunded-v_held) > 0.005 then
    raise exception ''Refund the rental payment first using Refund. This action returns only the remaining security deposit.'';
  end if;
  if exists(select 1 from public.rental_charge_items where rental_id=r.id and
    status not in (''waived'',''cancelled'') and not (
      source_type=''rental_balance'' and charge_type=''rental_amendment'' and status in (''pending'',''failed''))) then
    raise exception ''Resolve additional charges and payment attempts before cancelling.'';
  end if;
  if exists(select 1 from public.rental_extension_requests where rental_id=r.id
    and status not in (''cancelled'',''rejected'',''expired'')) then
    raise exception ''Resolve the extension request before cancelling.'';
  end if;
  -- Waive only the system balance created when the rental payment was refunded.
  -- Any later failure rolls this change back with the whole transaction.
  update public.rental_charge_items set status=''waived'', updated_at=now(),
    description=''Rental cancelled before pickup; original invoice credited.''
    where rental_id=r.id and source_type=''rental_balance''
      and charge_type=''rental_amendment'' and status in (''pending'',''failed'');
  select coalesce(jsonb_agg(b), ''[]''::jsonb) into v_blockers
    from jsonb_array_elements(public.rentmect_deposit_chain_release_blockers(r.id)) b
    where not (b->>''rental_id''=r.id::text and b->>''type'' in (''rental_not_completed'',''inspection_incomplete''));
  if jsonb_array_length(v_blockers)>0 then
    raise exception ''Resolve deposit blockers before cancelling: %'', v_blockers;
  end if;
  update public.rentals set status=''cancelled'', cancelled_at=now(), cancelled_by=p_actor_id,
    cancellation_reason=trim(p_reason), cancelled_before_pickup_at=now(),
    cancellation_credit_amount=round(coalesce(rental_total,0)+coalesce(service_fee_total,0)
      +coalesce(tax_amount,0)+coalesce(security_deposit,0),2),
    deposit_release_due_at=null, updated_at=now()
    where id=r.id returning * into r;
  update public.vehicles set status=''available'' where id=r.vehicle_id and status=''reserved''
    and not exists(select 1 from public.rentals other where other.vehicle_id=r.vehicle_id
      and other.id<>r.id and other.status not in (''cancelled'',''completed''));
  insert into public.rental_audit_events(rental_id,user_id,actor_id,event_type,event_payload)
    values(r.id,r.user_id,p_actor_id,''admin_cancelled_before_pickup'',jsonb_build_object(
      ''reason'',trim(p_reason),''cancellation_credit'',r.cancellation_credit_amount,
      ''deposit_refund_due'',v_held,''rental_refunds_already_succeeded'',v_refunded));
  return r;
end;
$function$
;']);
commit;
