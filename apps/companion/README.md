# KeyTone Studio Companion

Local companion app that runs Demucs stem extraction on the user's machine.

## Setup

1. Install Node.js (LTS).
2. Install Python 3.10+ and Demucs:

```bash
pip install demucs
```

3. Install dependencies and start the server:

```bash
cd apps/companion
npm install
node server.js
```

The server runs at http://localhost:5000.

## Environment

Optional:

```bash
# Demucs model name
DEMUCS_MODEL=htdemucs

# Change port if needed
PORT=5000
```

## Endpoints

- GET /health -> { "status": "ok" }
- POST /extract (multipart/form-data, file field name: file)

## Example fetch

```ts
const form = new FormData();
form.append("file", file);

const response = await fetch("http://localhost:5000/extract", {
  method: "POST",
  body: form,
});

if (!response.ok) {
  throw new Error("Local extraction failed");
}

const data = await response.json();
console.log(data);
```

## Health check

```ts
const health = await fetch("http://localhost:5000/health");
const status = await health.json();
```
