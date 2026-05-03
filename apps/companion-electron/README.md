# KeyTone Studio (Electron)

Desktop companion app for Windows + macOS. Runs Demucs locally and exposes a local API for the web app.

## Prereqs

- Node.js (LTS)
- Python 3.10+
- Demucs CLI

```bash
pip install demucs
```

## Run locally

```bash
cd apps/companion-electron
npm install
npm run dev
```

If the app says Demucs is missing, set this before launching:

```bash
set DEMUCS_CMD=python -m demucs
```

## Build installers

```bash
npm run dist
```

This produces:

- Windows installer (.exe via NSIS)
- macOS .dmg

Installers are named:

- KeyTone-Studio-Setup.exe
- KeyTone-Studio.dmg

## Local API

- GET http://localhost:5000/health
- POST http://localhost:5000/extract (multipart/form-data, field: file)

## Notes

- In packaged builds, output files are stored under the app userData directory.
- In dev, output files are under apps/companion-electron/output.
- The app auto-starts on login and minimizes to the system tray.
