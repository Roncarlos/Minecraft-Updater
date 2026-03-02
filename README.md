# Minecraft Mod Update Manager

A web-based tool for managing Minecraft mod updates across CurseForge instances. It detects breaking changes through version bump analysis, keyword scanning, and optional LLM-powered changelog analysis. Mods are sorted into actionable categories so you know exactly what needs attention before updating.

![Dashboard overview](docs/images/dashboard.png)

## Features

- **Multi-instance support** — Auto-detects all CurseForge instances and lets you switch between profiles
- **Smart categorization** — Sorts mods into 6 buckets: Breaking, Caution, Review Deps, Safe to Update, Updates Available, and Up to Date
- **Unified reference scanning** — Scans configs, KubeJS scripts, CraftTweaker/GroovyScript, quests, datapacks, resource packs, and Patchouli books for mod references, classified by severity (high/medium/low)
- **Dependency graph** — Builds a full dependency tree, warns about missing deps, and resolves transitive update chains
- **LLM changelog analysis** — Optional AI-powered analysis that classifies changes as breaking, caution, or safe
- **Keyword fallback** — When LLM is disabled, scans changelogs for breaking change keywords
- **Download, apply & rollback** — Download updates, apply them with automatic backup, and rollback if something goes wrong
- **Real-time progress** — SSE-based live scan progress in the browser, with cancel support to abort long scans mid-flight
- **Open in editor** — Click any config/script reference to open the file at that line in VS Code (falls back to OS default)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [CurseForge](https://www.curseforge.com/) desktop app installation with at least one Minecraft instance

### Installation

```bash
git clone <repo-url>
cd minecraft-mod-updater
npm install
```

### Running

**Development** (hot-reload for both frontend and backend):
```bash
npm run dev
```
This starts the Express backend on port 3000 and the Vite dev server on port 5173 (with API proxy).

**Production**:
```bash
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The app auto-detects CurseForge instances from the default path:
```
~/curseforge/minecraft/Instances
```

## Usage

### Scanning for Updates

1. Select your instance profile from the dropdown
2. Check the options you want:
   - **No Cache** — Force fresh API queries (ignores the configured cache max age)
   - **Check Changelogs** — Fetch and analyze changelogs for breaking changes
   - **LLM Analysis** — Use AI to classify changelog severity (requires configuration, see below)
   - **Limit** — Scan only the first N mods (useful for testing)
3. Click **Scan for Updates**
4. To abort a running scan, click **Cancel** — the UI returns to idle immediately and partial results are discarded

![Scan in progress](docs/images/scan-progress.png)

### Understanding the Results

After scanning, mods are sorted into 6 categories:

![Scan results with all categories](docs/images/scan-results.png)

| Category | Color | Meaning |
|----------|-------|---------|
| **Breaking Changes** | Red | LLM detected breaking changes, or version bump/keywords flagged AND high-severity references (scripts, quests, datapacks) |
| **Caution** | Orange | LLM detected caution-level changes, or version bump/keywords flagged with medium/low/no references |
| **Review Deps** | Purple | The mod itself is safe, but one or more of its dependencies are in Breaking or Caution |
| **Safe to Update** | Cyan | LLM confirmed safe — overrides version bump heuristics |
| **Updates Available** | Yellow | Has an update, no flags triggered, no LLM result |
| **Up to Date** | Green | Already on the latest version |

### Dependency Warnings

The **Deps** column shows how many dependencies each mod has. Warning icons appear when dependencies have issues:

- **Red ⚠** — At least one dependency has breaking changes
- **Orange ◆** — At least one dependency requires caution

Click the deps count to open the dependency modal, where each dependency shows its own warning icon.

![Dependencies modal with warning icons](docs/images/deps-modal.png)

### References

Click the refs count to see which files reference a mod, grouped by severity tier:

| Tier | Color | Directories |
|------|-------|-------------|
| **High** | Red | KubeJS server/startup scripts, CraftTweaker/GroovyScript, datapacks, quest files (FTB Quests, Better Questing, Heracles) |
| **Medium** | Orange | Config files, default configs, KubeJS client scripts, OpenLoader, Patchouli books |
| **Low** | Muted | Resource packs |

A mod's overall severity is its worst tier. This affects categorization — mods with high-severity refs and version bumps go to Breaking Changes, while mods with only low-severity refs go to Caution.

Each file path is clickable — it opens the file in VS Code at the referenced line (requires `code` on PATH). If VS Code isn't available, the file opens in the OS default handler.

![References modal](docs/images/config-refs.png)

### Changelog Analysis

When changelogs are checked, a severity badge appears in the Status column. Click it to view the full LLM analysis or keyword matches for each version between your installed version and the latest.

![LLM changelog analysis modal](docs/images/llm-analysis.png)

### Downloading & Applying Updates

Each section has bulk action buttons:

- **Download All** — Downloads all mods in the section (and their dependencies)
- **Apply All** — Replaces old jars with downloaded updates (backs up old files first)
- **Rollback All** — Restores backed-up jars and removes the new ones

You can also download, apply, and rollback individual mods using the per-row buttons.

![Section with bulk action buttons](docs/images/bulk-actions.png)

## LLM Configuration

LLM analysis is optional but significantly improves categorization accuracy. It works with any OpenAI-compatible API endpoint (LM Studio, Ollama, vLLM, OpenAI, etc.).

### Setup via the UI

1. Click the **gear icon** (⚙) in the controls bar
2. Fill in the settings:

![Settings modal with LLM configuration](docs/images/settings-llm.png)

#### Cache Settings

| Setting | Description |
|---------|-------------|
| **Cache Max Age** | How many hours before cached scan results are considered stale (1–720, default: 24) |
| **Prune Days** | Delete cache entries older than this many days (1–90, default: 7) |

#### LLM Settings

| Setting | Description |
|---------|-------------|
| **Enabled** | Toggle LLM analysis on/off |
| **Endpoint** | OpenAI-compatible chat completions URL (e.g., `http://localhost:1234/v1/chat/completions`) |
| **API Key** | Bearer token (optional — leave blank for local servers) |
| **Model** | Model name as reported by your server (e.g., `mistralai/ministral-3-3b`) |
| **Max Tokens** | Maximum tokens per response (default: 1024) |
| **Temperature** | Lower = more deterministic (default: 0.1) |
| **Concurrency** | Number of parallel LLM requests (default: 2) |

3. Click **Test Connection** to verify the LLM endpoint is reachable
4. Click **Detect** next to Concurrency to auto-detect how many model instances your server supports (works with LM Studio's `:N` instance suffixes)
5. Click **Save**

The **LLM Analysis** checkbox in the scan controls will now be enabled.

### Setup via settings.json

You can also edit `settings.json` directly in the project root:

```json
{
  "cache": {
    "maxAgeHours": 24,
    "pruneDays": 7
  },
  "llm": {
    "enabled": true,
    "endpoint": "http://localhost:1234/v1/chat/completions",
    "apiKey": "",
    "model": "mistralai/ministral-3-3b",
    "maxTokens": 1024,
    "temperature": 0.1,
    "concurrency": 2
  }
}
```

### Recommended LLM Providers

| Provider | Endpoint Example | Notes |
|----------|-----------------|-------|
| **LM Studio** | `http://localhost:1234/v1/chat/completions` | Supports multi-instance concurrency detection |
| **Ollama** | `http://localhost:11434/v1/chat/completions` | Use Ollama's OpenAI-compatible endpoint |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | Requires API key |
| **Any OpenAI-compatible** | Varies | Must support `/v1/chat/completions` |

A small, fast model (3B–8B parameters) is sufficient — the analysis prompt is concise and structured. Larger models won't significantly improve results but will be slower.

### How LLM Analysis Works

Each changelog is sent to the LLM with a prompt asking it to classify the changes into one of three severity levels:

| Severity | What it means | Examples |
|----------|---------------|---------|
| **Safe** | No risk to existing setups | Bug fixes, performance improvements, new features, translations, cosmetic changes |
| **Caution** | Might affect existing setups | Config format changes, renamed features, deprecations, behavior changes |
| **Breaking** | Will likely break existing setups | Removed items/blocks, deleted features, incompatible world changes, required migrations |

The LLM returns structured JSON with a severity, a 1–2 sentence summary, and a list of specific breaking items. Results are cached alongside changelogs so subsequent scans don't re-analyze.

When LLM severity is available, it takes priority over heuristics:
- **LLM "safe"** overrides version bump detection — if the LLM says it's safe, it goes to Safe to Update even with a major version bump
- **LLM "breaking"** always goes to Breaking Changes regardless of config references
- **LLM "caution"** goes to the Caution bucket

If the LLM fails or is disabled, the system falls back to keyword-based detection.

## How Categorization Works

The classification logic uses multiple signals in priority order:

```
1. LLM severity available?
   ├─ "safe"     → Safe to Update (overrides everything)
   ├─ "caution"  → Caution
   └─ "breaking" → Breaking Changes

2. No LLM, but version bump or breaking keywords found?
   ├─ High-severity refs → Breaking Changes
   └─ Medium/low/no refs → Caution

3. No flags at all?
   └─ Updates Available

4. After classification:
   └─ Safe mods with deps in Breaking/Caution → Review Deps
```

## Project Structure

```
minecraft-mod-updater/
├── server.js              # Express server & API routes
├── settings.json          # User configuration (cache & LLM settings)
├── package.json
├── lib/
│   ├── config.js          # Constants, paths, keywords, regex
│   ├── scanner.js         # Scan logic & 6-bucket classification
│   ├── curseforge.js      # CurseForge API client (rate-limited)
│   ├── versioning.js      # Semver extraction, version bump detection
│   ├── llm.js             # LLM changelog analysis with concurrency
│   ├── depgraph.js        # Dependency graph & topological sort
│   ├── downloader.js      # Download, apply & rollback operations
│   ├── settings.js        # Settings file management
│   ├── report.js          # LLM-readable scan report builder
│   └── html-to-text.js    # HTML-to-plain-text converter for changelogs
├── client/                # React frontend (Vite + TypeScript + Tailwind 4)
│   ├── src/
│   │   ├── App.tsx        # Root component, modal state
│   │   ├── context.ts     # AppContext with useReducer
│   │   ├── api/           # Typed fetch wrappers & endpoint functions
│   │   ├── hooks/         # useScanStream, useInstances, useModActions, etc.
│   │   ├── utils/         # Dependency graph helpers, severity rules
│   │   └── components/    # layout/, results/, modals/, ui/
│   └── dist/              # Production build (served by Express)
├── .claude/
│   └── commands/
│       └── modpack-report.md  # /modpack-report slash command for Claude Code
├── docs/
│   └── images/            # Screenshots for documentation
├── downloads/             # Staged mod downloads (auto-created)
├── backups/               # Old mod JARs (auto-created on apply)
└── ModUpdateCache.json    # Scan cache (auto-generated)
```

## API Reference

<details>
<summary>Click to expand API endpoints</summary>

### Instance Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/instances` | List all detected CurseForge instances |
| GET | `/api/instance` | Get current instance info |
| POST | `/api/instance/select` | Switch to a different instance |

### Scanning

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scan/stream` | Start scan with SSE progress (query params: `noCache`, `checkChangelogs`, `useLlm`, `limit`) |
| POST | `/api/scan/cancel` | Abort a running scan |
| GET | `/api/scan/results` | Get last completed scan results |
| GET | `/api/report` | Get an LLM-readable report of the last scan (token-efficient JSON) |

### References

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config-refs/:addonId` | List files referencing a mod (with line numbers and severity breakdown) |

### File Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/open-file` | Open a file in VS Code or OS default handler (body: `filePath`, optional `line`) |

### Downloads & Updates

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/download` | Download a single mod |
| POST | `/api/download/bulk` | Download multiple mods |
| POST | `/api/apply` | Apply a single update (with backup) |
| POST | `/api/apply/bulk` | Apply multiple updates |
| POST | `/api/rollback` | Rollback a single update |
| POST | `/api/rollback/bulk` | Rollback multiple updates |
| GET | `/api/download-state` | Get download/apply status for all mods |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Load current settings |
| POST | `/api/settings` | Save settings |
| POST | `/api/settings/test-llm` | Test LLM endpoint connectivity |
| GET | `/api/settings/detect-concurrency` | Detect available model instances |

</details>

## Claude Code Integration

You can ask [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to analyze your scan results and recommend an update strategy using the included slash command.

### Setup

1. Install Claude Code if you haven't already
2. The slash command is included at `.claude/commands/modpack-report.md` — no setup needed
3. Make sure the mod updater is running (`npm run dev` or `npm start`)
4. Open Claude Code in the project directory

### Usage

Run the slash command:

```
/modpack-report
```

Or specify an instance name:

```
/modpack-report ATM10
```

Claude will automatically check the server, select the instance, run a scan if needed, fetch the report, and produce a concrete update plan: what to skip, what needs config adjustments, and what's safe to bulk-update.

You can also fetch the report manually for use with any LLM:

```bash
curl -s http://localhost:3000/api/report | jq .
```

### What the report includes

The `/api/report` endpoint returns a single JSON object designed for token efficiency:

- **Instance metadata** — name, MC version, loader, mod counts
- **Summary counts** — per-category totals at a glance
- **Categorized mods** — breaking, caution, reviewDeps, safeToUpdate, and updatesAvailable (up-to-date mods are excluded — just counted)
- **Plain-text changelogs** — HTML stripped, entities decoded, LLM analysis inlined
- **Config references** — file paths with line numbers and severity tiers
- **Resolved dependencies** — addon IDs mapped to names and categories
- **Missing deps & errors** — with context on which mods need them

## License

MIT
