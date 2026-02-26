# CiudadanIA

A local-first summarization and evaluation workbench built with React + Vite (and optional Electron packaging).

The app supports:
- Interactive single-text summarization (Playground)
- Batch processing from files (Workbench)
- OpenAI-compatible endpoints (cloud or local)
- Multi-configuration runs for side-by-side comparison
- Automated rubric-based evaluation (“LLM as judge”)

![Application screenshot](browser:/tmp/codex_browser_invocations/e8e2587e281fec53/artifacts/readme-screenshot.png)

---

## What it does

### 1) Playground mode
Use a single input text and run one or more selected models in parallel.

You can control:
- System instruction
- Temperature / top-p / output token limit
- Tone and output format
- Max words
- Optional custom focus

The app generates one output per active model and displays results side-by-side.

### 2) Workbench (batch) mode
Process multiple records at once and compare custom run configurations.

Batch inputs can be loaded from:
- `.txt`
- `.csv`
- `.xlsx` / `.xls`
- `.docx`
- `.pdf`

Each batch item tracks:
- Processing status
- Generated outputs per run configuration
- Optional reference summary
- Evaluation scores and notes

### 3) Evaluation (judge)
Generated summaries can be graded using configurable weighted criteria (for example: accuracy, clarity, conciseness, completeness).

Judge options:
- Reuse the same generation model as judge
- Or configure a separate judge endpoint/model
- Optional reference summary comparison (gold standard)

Evaluation responses are parsed from strict JSON output and normalized to a 0–10 scale.

### 4) UX and accessibility
- English and Spanish localization
- Resizable sidebar and split-pane layout
- Keyboard skip link and ARIA labels in key UI sections
- Toast notifications and loading skeletons

---

## Readiness review

Current implementation checks:
- Web workflow and batch workflow are both wired in `App.tsx` and `useBatchProcessor`.
- OpenAI-compatible request handling includes endpoint normalization, retries, and structured error messages.
- API keys are not persisted in history snapshots.
- History data is stored in browser `localStorage` (source text + outputs), so sensitive data handling policy is still required.
- PDF parsing currently uses an external CDN worker URL at runtime.

## Architecture

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Testing:** Vitest + Testing Library
- **Desktop packaging (optional):** Electron + electron-builder

Core modules:
- `App.tsx`: main state orchestration (playground + workbench + history)
- `components/`: UI panels and layout
- `services/llmService.ts`: prompt building, endpoint normalization, API requests, evaluation
- `src/hooks/useBatchProcessor.ts`: batch execution pipeline
- `src/utils/requestQueue.ts`: retry with exponential backoff

---

## Getting started

### Prerequisites
- Node.js 18+
- npm

### Install
```bash
npm install
```

### Run (web)
```bash
npm run dev
```

### Build (web)
```bash
npm run build
npm run preview
```

### Run tests
```bash
npm test
```

---

## Endpoint configuration

The app expects OpenAI-compatible APIs.

### Cloud endpoint
Provide:
- Base URL (for example, ending in `/v1` or full `/chat/completions`)
- API key

### Local endpoint
Provide:
- Local server URL (default: `http://localhost:1234/v1/chat/completions`)

The app normalizes common endpoint forms automatically (`/v1`, `/models`, `/chat/completions`) and handles model discovery via `/models` where available.

---

## Desktop build (optional)

### Option A: Electron (already included in this repository)

1. Run in desktop development mode:
```bash
npm run electron:dev
```

2. Build desktop artifacts:
```bash
npm run electron:build
```

This uses:
- `electron/main.ts` (main process)
- `electron/preload.ts` (preload bridge)
- `electron-builder` packaging config in `package.json`

### Option B: Similar desktop runtime (for example, Tauri)

If you prefer a lighter runtime:
1. Keep the current frontend build (`npm run build`).
2. Create a Tauri shell and point it to the generated `dist/` folder.
3. Move environment and endpoint configuration to Tauri-managed config files.
4. Reapply the same privacy controls (no key persistence, local storage policy, trusted endpoints).

The current codebase is frontend-first, so migrating to another shell mainly affects packaging and OS integration, not React components.

---

## Security and privacy notes

If this repository is made public, consider the following operational safeguards:

1. **API keys**
   - API keys are entered by users at runtime.
   - History snapshots now sanitize and avoid persisting API keys.

2. **Local browser storage**
   - Generation history (source text, outputs, settings snapshot) is stored in `localStorage` for convenience.
   - Do not use real sensitive production text unless your policy allows browser-local persistence.

3. **External dependency for PDF worker**
   - PDF parsing currently uses a CDN-hosted PDF worker URL at runtime.
   - In restricted environments, replace this with a locally hosted worker asset.

4. **Client-side execution model**
   - Requests are sent directly from the client UI to configured endpoints.
   - Use trusted endpoints, HTTPS, and least-privilege API keys.

5. **Electron distribution**
   - Review desktop hardening settings and signing practices before production distribution.

---

## Maintainers and contributors

If you want to continue or modify the project, read:
- [`CONTINUATION_GUIDE.md`](CONTINUATION_GUIDE.md)

This guide includes architecture handover, extension points, security assumptions, and an agent-agnostic workflow for future changes.

---

## Repository scripts

- `npm run dev` — run Vite dev server
- `npm run build` — build web assets
- `npm run preview` — preview production build
- `npm run test` — run Vitest suite
- `npm run electron:dev` — run web + Electron in development
- `npm run electron:build` — build Electron distribution

