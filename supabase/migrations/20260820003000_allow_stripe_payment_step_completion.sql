begin;

-- Final Stripe installment payments are reconciled by
-- sync_rental_remaining_balance(), which records the completed payment step
-- with the canonical `stripe_payment` source. The original assisted-booking
-- constraint predates Stripe installments and rejected that source, rolling
-- back the paid charge and leaving an open reconciliation issue.
alter table public.rental_step_completions
  drop constraint if exists rental_step_completions_completion_source_check;

alter table public.rental_step_completions
  add constraint rental_step_completions_completion_source_check
  check (completion_source in (
    'admin_in_person',
    'admin_document_review',
    'admin_office_signature',
    'admin_external_payment',
    'admin_deposit_collected',
    'admin_deposit_waived',
    'stripe_payment'
  ));

comment on constraint rental_step_completions_completion_source_check
  on public.rental_step_completions is
  'Allows canonical admin-assisted completion sources plus Stripe payments reconciled by the service role.';

commit;
