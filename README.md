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

## GitHub Pages

This project uses:

```js
base: '/'
build.outDir: 'dist'
```

Use GitHub Actions to build and deploy the `dist` folder.

## Features Included

- Admin login restricted by `VITE_ADMIN_EMAIL`
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
- Placeholder SMS/email reminder buttons for future Twilio/Resend Edge Functions
