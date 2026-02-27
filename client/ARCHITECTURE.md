# Client Architecture

## Stack

- **React 19** + **TypeScript** — Component-based UI
- **Vite** — Dev server (port 5173) + production bundler
- **Tailwind CSS 4** — CSS-first config with `@theme` for dark palette
- **react-hook-form** — Form handling in SettingsModal only

## Directory Structure

```
client/
  index.html              # Vite entry point
  vite.config.ts          # Vite config with /api proxy to Express
  src/
    main.tsx              # ReactDOM.createRoot
    App.tsx               # Root: context provider, layout, modal host
    context.ts            # AppContext, useReducer, actions
    types.ts              # All TypeScript interfaces
    index.css             # Tailwind directives + @theme

    api/
      client.ts           # Typed fetch wrappers (get<T>, post<T>)
      endpoints.ts         # One function per API endpoint

    hooks/
      useScanStream.ts    # SSE via EventSource
      useInstances.ts     # Profile list + selection
      useModActions.ts    # download/apply/rollback (single + bulk)
      useSettings.ts      # Load/save settings, test LLM, detect concurrency
      useDownloadState.ts # Per-addon download/apply status

    utils/
      depGraph.ts         # buildUpdateLookup, buildAllModsLookup, resolveDependencyChain, topologicalSort
      severityRules.ts    # FILE_SEVERITY_RULES for grouping config refs by tier

    components/
      layout/             # Header, ControlsBar, ProgressBar, Footer
      results/            # ResultsContainer, ResultSection, ModTable, ModRow, ActionButtons, BulkActions, RefLink, DepLink, LlmBadge, StatusBadge
      modals/             # ModalShell, ModalHost, RefsModal, DepsModal, ChangelogModal, ApplyConfirmModal, SettingsModal
      ui/                 # Button, Checkbox, NumberInput, Select
```

## State Management

**React Context + `useReducer`** at the App level:
- Instances, selected profile, instance meta
- Scan state (running, progress, results)
- Download state per addon
- Settings + LLM configured flag

**Local state** for:
- Modal (discriminated union in App.tsx)
- Scan options (ControlsBar)
- Section collapsed state (ResultSection)
- Button busy state (ActionButtons, BulkActions)

## API Layer

Components never call `fetch` directly. All API calls go through:
1. `api/client.ts` — `get<T>()` and `post<T>()` with typed error handling
2. `api/endpoints.ts` — one typed function per endpoint

## Theme

Tailwind 4 CSS-first config in `index.css` using `@theme` block. All colors (bg, surface, border, text, muted, danger, warning, success, info, cyan, orange, purple) defined as theme tokens, usable as `bg-bg`, `text-muted`, `border-border`, `bg-danger-bg`, etc.

## Dev / Build

- **Dev:** `npm run dev` from root runs Express (3000) + Vite (5173) concurrently. Vite proxies `/api` to Express.
- **Build:** `npm run build` runs `vite build` in client/, outputs to `client/dist/`.
- **Production:** `npm start` runs Express which serves `client/dist/` as static files.
