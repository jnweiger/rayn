# Rayn

Rayn is a desktop app for preparing laser cutter jobs. It is built with Wails, Go, React, Tailwind CSS and Fabric.js.

The app focuses on a clean workspace for importing SVG files, positioning artwork on a laser bed, selecting a configured laser, choosing material settings, and starting a job.

## Current Features

- Light mode desktop UI with shadcn-style components
- Laser management with machine type, connection details, bed size and optional image
- Material profiles scoped per laser
- Multiple material thickness presets per material profile
- SVG import into a Fabric.js canvas
- Canvas zoom and preview backgrounds, including checkerboard for white artwork
- Job settings with job name, laser selection, material selection and thickness selection
- Estimated job duration based on SVG geometry and selected operation speeds
- Basic controller structure for Epilog Zing and Ruida/Thunderlaser machines

## Project Status

The UI and job preparation flow are under active development.

The laser controller implementations currently connect and log job data, but the final PJL/HPGL and Ruida packet generation is not implemented yet. Treat hardware output as experimental until those protocol paths are finished and tested on real machines.

## Tech Stack

- Wails v2
- Go 1.23
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Fabric.js

## Requirements

Install these before working on the project:

- Go 1.23 or newer
- Node.js and npm
- Wails CLI v2
- Platform build tools required by Wails

Install the Wails CLI if needed:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Check your local setup:

```bash
wails doctor
```

## Development

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

Start the app in development mode:

```bash
wails dev
```

Wails starts the Vite dev server automatically. The usual URLs are:

- App dev server with Go bindings: `http://localhost:34115`
- Vite frontend server: `http://localhost:5173`

Use the Wails dev server URL when you want to test frontend code that calls Go methods.

## Useful Commands

Run the frontend build:

```bash
cd frontend
npm run build
```

Run Go checks:

```bash
go test ./...
```

Build a distributable app:

```bash
wails build
```

Wails regenerates frontend bindings during `wails dev` and `wails build` when exported Go methods or models change.

## Project Structure

```text
.
├── app.go                  # Wails app methods and persisted laser/profile data
├── materials.go            # Material profile storage and normalization
├── controller.go           # Laser controller interface
├── factory.go              # Laser controller selection
├── epilog_zing.go          # Epilog Zing controller stub
├── ruida.go                # Ruida/Thunderlaser controller stub
├── frontend/
│   ├── src/App.tsx         # Main app state and data flow
│   ├── src/components/     # Workspace, job settings and app UI
│   ├── src/lib/            # Shared frontend helpers
│   └── wailsjs/            # Generated Wails bindings
└── wails.json              # Wails project configuration
```

## Local Data

Rayn stores user configuration in the operating system config directory under `rayn`.

On macOS this is typically:

```text
~/Library/Application Support/rayn/
```

The main files are:

- `lasers.json`
- `materials.json`
- `profiles.json`

These files are local development/user data and should not be committed.
