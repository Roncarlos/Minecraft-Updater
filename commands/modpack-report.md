Fetch the modpack scan report and advise on the safest update strategy.

## Instructions

1. The Minecraft Mod Update Manager must be running on http://localhost:3000 with a completed scan.
2. Fetch the report:
   ```
   curl -s http://localhost:3000/api/report
   ```
3. Analyze the full JSON response. Focus on:
   - **Breaking Changes** — What specifically breaks and why. Look at `breakingReason`, `llmSeverity`, `changelogs`, and `keywordMatches`.
   - **Config references** — Mods with `configRefs` touching high-severity files (KubeJS server scripts, quests, datapacks) need extra care.
   - **Dependency chains** — If a breaking mod is required by other mods, call those out.
   - **Caution mods** — Summarize what to watch for.
   - **Safe updates** — Confirm which can be bulk-updated without worry.

4. Produce a concise update plan with this structure:
   - **Do NOT update** — Mods that will break the pack, with reasons
   - **Update with care** — Mods that need config/script adjustments after updating, with specifics
   - **Safe to bulk-update** — Everything else that has an update available
   - **Missing dependencies** — If any, note what's missing and which mods need it
   - **Recommended update order** — If dependency chains matter, suggest the order

Keep the advice practical and specific to this modpack. Reference mod names, version numbers, and affected config files by name.
