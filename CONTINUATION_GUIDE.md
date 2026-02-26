# Project Continuation Guide

This document is a practical handover for any contributor (human or agent) who wants to maintain, extend, or refactor this project.

## 1) Project purpose

The app is a summarization and evaluation workbench with two modes:
- **Playground**: summarize one text with one or multiple selected models.
- **Workbench**: process batches (CSV/XLSX/DOCX/PDF/TXT), run multiple configurations, and score outputs with a judge model.

## 2) Tech stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS
- Vitest + Testing Library
- Optional Electron shell for desktop distribution

## 3) Key directories and files

- `App.tsx`
  - Root orchestration for app state, history, mode switching, and generation triggers.
- `components/`
  - UI modules (sidebar, input/output, batch results, run config manager).
- `services/llmService.ts`
  - Prompt creation, endpoint normalization, OpenAI-compatible request logic, and judge evaluation.
- `src/hooks/useBatchProcessor.ts`
  - Batch execution and evaluation pipeline.
- `src/utils/requestQueue.ts`
  - Retry/backoff utility used by API calls.
- `electron/main.ts`, `electron/preload.ts`
  - Desktop runtime entrypoints.

## 4) Runtime model

### Web mode
- Start with `npm run dev`.
- Vite serves on port `3000`.
- API calls are client-side fetches directly to configured cloud/local endpoints.

### Desktop mode (Electron)
- Development: `npm run electron:dev`
- Build: `npm run electron:build`
- Packaging config is in `package.json` under the `build` section.

## 5) Configuration behavior

- Provider options: `cloud` and `local`.
- Endpoint values are normalized in `services/llmService.ts` so users can input `/v1`, `/models`, or full `/chat/completions`.
- Model lists may come from endpoint `/models`; fallback defaults are in `types.ts` (`DEFAULT_MODEL_OPTIONS`).

## 6) Privacy and security assumptions

- API keys are user-entered at runtime.
- History snapshots are saved to browser `localStorage`.
- `cloudApiKey` is sanitized before history persistence (not stored in snapshots).
- Source text and generated outputs *are* persisted in history; do not run highly sensitive data unless policy allows local persistence.
- PDF worker currently uses a CDN URL at runtime (`components/InputArea.tsx`); if your environment is strict, switch to a local worker asset.

## 7) Typical extension points

- Add new prompt controls:
  - Extend `AppConfig` in `types.ts`
  - Update `Sidebar.tsx` and `RunConfigPanel.tsx`
  - Use in `buildPrompt()` in `services/llmService.ts`
- Add new batch metadata columns:
  - Extend parsing logic in `components/InputArea.tsx`
  - Extend `BatchItem` type in `types.ts`
  - Render in `components/BatchResults.tsx`
- Add new evaluation criteria UX:
  - `components/Sidebar.tsx` (criteria editor)
  - `services/llmService.ts` (`evaluateSummary` prompt & parser)

## 8) Agent-friendly modification workflow

1. Read `README.md` + this file first.
2. Identify affected types in `types.ts`.
3. Update logic (`services/`, `hooks/`) before UI wiring.
4. Update UI components.
5. Run checks:
   - `npm run build`
   - `npm test`
   - `npx tsc -p electron/tsconfig.json`
6. If UI changed, take a screenshot and update docs.
7. Update README sections if behavior changes.

## 9) Known caveats

- Test suite currently reports a known unhandled rejection warning in `src/utils/requestQueue.test.ts` even when tests pass.
- Production build warns about large bundle chunk size; code-splitting can be improved later.

## 10) Suggested next improvements

- Move PDF worker to local asset to remove external runtime dependency.
- Add encrypted or opt-in history storage mode.
- Add E2E smoke test (Playwright) for key workflows.
- Harden Electron security flags and add explicit IPC allowlist if native features are introduced.
