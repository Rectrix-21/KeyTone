# KeyTone API

FastAPI backend for KeyTone audio analysis and MIDI generation.

## Features

- Authenticated upload endpoint with Supabase JWT
- File validation (MP3/WAV/M4A, max 25 MB)
- BPM and key analysis (`librosa`)
- MIDI transcription (`basic-pitch`)
- 3 key-preserving MIDI variations (`pretty_midi`)
- Supabase Storage persistence for audio/MIDI/analysis JSON
- Credit-based enforcement and Stripe webhook handling

## Setup

1. Create and activate Python virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and provide values.

   To grant unlimited credits to admin users, set `ADMIN_EMAILS` as a comma-separated list (for example: `ADMIN_EMAILS=admin@yourdomain.com,owner@yourdomain.com`).

4. (Optional but recommended) Enable MusicVAE candidate generation for Track Starter.

```bash
pip install magenta note-seq
```

Then set these environment values in `.env`:

```env
MUSICVAE_ENABLED=true
MUSICVAE_CHECKPOINT_PATH=/absolute/path/to/musicvae/checkpoint
MUSICVAE_CONFIG_NAME=cat-mel_2bar_big
```

If MusicVAE is not available or not configured, the API will automatically fall back to deterministic candidate mutation while keeping the same scoring and selection pipeline.

5. Run the API:

```bash
# Option A (recommended): run from apps/api directory
cd apps/api
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Option B: run from repo root
cd ..
python -m uvicorn --app-dir apps/api app.main:app --reload --host 127.0.0.1 --port 8000
```

If you see `ModuleNotFoundError: No module named 'app'`, it means the command was run from the wrong directory without `--app-dir apps/api`.

## Endpoints

- `GET /health`
- `GET /v1/users/me`
- `GET /v1/projects`
- `GET /v1/projects/{project_id}`
- `POST /v1/projects/upload`
- `POST /v1/stripe/create-checkout-session`
- `POST /v1/stripe/webhook`
