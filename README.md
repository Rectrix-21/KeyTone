# KeyTone

KeyTone is a production-ready MVP that converts uploaded audio into analyzed and downloadable MIDI assets.

## Features

- BPM detection and musical key detection
- MIDI generation from audio via Spotify Basic Pitch
- Chord suggestions based on detected key
- 3 MIDI variations preserving key and rhythmic feel
- Downloadable base MIDI, variation MIDIs, and analysis JSON
- Supabase auth + upload history + storage
- Credit-based usage (free users: 3 conversions)
- Stripe subscription checkout + webhook updates

## Monorepo Structure

- `apps/web`: Next.js 15, TypeScript, Tailwind frontend
- `apps/api`: FastAPI Python backend
- `supabase/migrations`: schema, RLS, and storage bucket setup

## Prerequisites

- Node.js 20+
- Python 3.11+
- Supabase project
- Stripe account and product/price configured

## Environment Variables

Use these templates:

- Root: `.env.example`
- Web: `apps/web/.env.example` -> `apps/web/.env.local`
- API: `apps/api/.env.example` -> `apps/api/.env`

Required values include:

- Supabase URL, anon key, and service role key
- Stripe secret key, webhook secret, and price id
- `NEXT_PUBLIC_API_BASE_URL`

## Database Setup (Supabase)

1. Open Supabase SQL editor.
2. Run: `supabase/migrations/001_init_looplift.sql`.
3. Confirm tables and storage buckets (`audio`, `midi`, `analysis`) were created.

## Run API

```bash
cd apps/api
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Run Web

```bash
cd apps/web
npm install
npm run dev
```

Web runs at `http://localhost:3000`, API at `http://localhost:8000`.

## Stripe Webhook (Local)

```bash
stripe listen --forward-to localhost:8000/v1/stripe/webhook
```

Copy the reported webhook secret into `apps/api/.env` as `STRIPE_WEBHOOK_SECRET`.

## Notes

- Upload processing is asynchronous: upload -> pending/processing -> completed.
- Credits are deducted on accepted conversion and refunded automatically if processing fails.
