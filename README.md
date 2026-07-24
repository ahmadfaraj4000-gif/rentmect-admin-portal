# Rent Me CT Admin Portal

Vite + React admin portal for Rent Me CT.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ADMIN_EMAIL=your_admin_email@example.com
VITE_RENTMECT_ADDRESS=485 Colt Hwy, Farmington, CT
```

Before using **Settings → Website Promotion Manager**, run
`../supabase/site_promotions.sql` in the connected Supabase project's SQL Editor.
This creates the promotion table, admin-only write policies, time-limited public
read policy, and imports the current July 2026 promotion as the first campaign.

## Deployment

This project uses:

```js
base: './'
build.outDir: 'dist'
```

Run `npm run build` and deploy the full `dist` folder, including `dist/assets`.
The relative base keeps the built files working whether the portal is hosted at
`/admin/`, `/rentmect-admin-portal/`, or another subdirectory.

## Staff access and audit log

Each staff member must have their own Supabase Auth user and a matching
`public.profiles` row whose `role` is `admin`. Do not share credentials: the
Audit Log uses the authenticated user ID and email to attribute every action.

Before opening the Audit Log or using deposit refunds, run
`../supabase/admin_audit_and_deposit_controls.sql`. Deploy the updated
`stripe-web-hook` Edge Function, configure its Stripe secrets, and then run
`../supabase/security_deposit_release_schedule.sql` after adding the Vault
values described at the top of that file.

For Stripe Identity, also run `../supabase/stripe_identity_verification.sql`,
enable Identity in Stripe, and subscribe the same signed webhook endpoint to
the Identity VerificationSession events listed in `../LAUNCH_READINESS.md`.

## Features Included

- Admin login restricted by each authenticated profile's `admin` role
- Immutable, redacted staff audit trail with actor, action, record, and time
- Dashboard metrics
- Cars out / due soon / overdue monitor
- Monthly revenue estimate
- Active deposits monitor
- Rental status updates
- Customer list
- Vehicle fleet manager
- Add vehicle form
- Vehicle maintenance/unavailable status
- Document review queue
- Approve/reject documents
- Customer/admin message center
- Mock reservations without Stripe payment
- SendGrid email automation, campaigns, and admin one-to-one template emails
- Twilio automated rental reminders and admin one-to-one template texts
- Scheduled website popup and banner promotion manager with per-page placement
- Manual Stripe security-deposit refunds and automatic clean-return refunds after seven days
- Hosted Stripe Identity government-ID and selfie verification required before pickup
