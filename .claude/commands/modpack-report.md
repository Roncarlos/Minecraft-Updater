Fetch the modpack scan report and advise on the safest update strategy.

Run all setup steps automatically — no user interaction needed.

## Step 1 — Verify the server is running

```
curl -sf http://localhost:3000/api/instances
```

If this fails, tell the user: "Start the Mod Update Manager first: `npm run dev`" — then **stop**.

## Step 2 — Select the modpack instance

```
curl -s http://localhost:3000/api/instances
```

This returns `{ "instances": [{ "name": "...", "path": "..." }, ...], "selected": "..." }`.

- If the user specified an instance name as arguments (`$ARGUMENTS`), select it:
  ```
  curl -s -X POST http://localhost:3000/api/instance/select \
    -H "Content-Type: application/json" -d '{"name":"<instance-name>"}'
  ```
- If `$ARGUMENTS` is empty, use the already-selected instance (shown in the `selected` field).
- If nothing is selected and no argument was given, select the first instance in the list.

Tell the user which instance you're using.

## Step 3 — Get or generate the report

First, try fetching an existing report:
```
curl -sf http://localhost:3000/api/report
```

- If this succeeds with valid JSON → skip to Step 4.
- If this returns an error (404) → a scan is needed. Run one:

```
curl -sN "http://localhost:3000/api/scan/stream?checkChangelogs=true&useLlm=true" > /dev/null
```

This is an SSE stream. Wait for curl to exit — the scan runs on the server and may take a few minutes. Do NOT cancel it early.

After the scan finishes, fetch the report:
```
curl -s http://localhost:3000/api/report
```

## Step 4 — Analyze the report

Analyze the full JSON response. Focus on:
- **Breaking Changes** — What specifically breaks and why. Look at `breakingReason`, `llmSeverity`, `changelogs`, and `keywordMatches`.
- **Config references** — Mods with `configRefs` touching high-severity files (KubeJS server scripts, quests, datapacks) need extra care.
- **Dependency chains** — If a breaking mod is required by other mods, call those out.
- **Caution mods** — Summarize what to watch for.
- **Safe updates** — Confirm which can be bulk-updated without worry.

## Step 5 — Produce the update plan

Output a concise update plan with this structure:
- **Do NOT update** — Mods that will break the pack, with reasons
- **Update with care** — Mods that need config/script adjustments after updating, with specifics
- **Safe to bulk-update** — Everything else that has an update available
- **Missing dependencies** — If any, note what's missing and which mods need it
- **Recommended update order** — If dependency chains matter, suggest the order

Keep the advice practical and specific to this modpack. Reference mod names, version numbers, and affected config files by name.
