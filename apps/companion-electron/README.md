# KeyTone Studio (Electron)

Desktop companion app for Windows + macOS. Runs Demucs locally and exposes a local API for the web app.

## Prereqs

- Node.js (LTS)

Python and Demucs are installed automatically from inside the app with the
"Install AI Engine" button.

## Run locally

```bash
cd apps/companion-electron
npm install
npm run dev
```

If automatic install fails, install Python 3.10+ and rerun the in-app install.

The app also auto-repairs missing runtime packages (like torchcodec) during
extraction and retries automatically.

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
- You can choose which stems to export inside the app UI.
- The app tries `demucs` first and falls back to `python -m demucs` if needed.
