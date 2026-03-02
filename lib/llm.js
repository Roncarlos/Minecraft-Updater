import { stripHtml } from "./versioning.js";

const SYSTEM_PROMPT = `You are a Minecraft mod changelog analyzer. Given a changelog entry, analyze it for breaking changes that could affect a modpack.

Respond with ONLY valid JSON (no markdown fences, no extra text) in this format:
{
  "severity": "safe|caution|breaking",
  "summary": "1-2 sentence summary of changes",
  "breakingItems": ["specific breaking change 1", "specific breaking change 2"]
}

Severity guidelines:
- "safe": bug fixes, performance improvements, additive features, translations, cosmetic changes, internal refactors, added compatibility layers, non-breaking config changes
- "caution": config format changes, renamed or moved features, deprecations, behavior changes that might affect existing setups
- "breaking": removed items/blocks/entities, deleted features, incompatible world changes, required migration steps, API removals

If there are no breaking items, return an empty array for breakingItems.
Focus on changes that would affect an existing modpack. Be concise.`;

function truncateText(text, maxLen = 3000) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n... [truncated]";
}

function parseJsonResponse(text) {
  // Strip markdown fences if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return JSON.parse(cleaned);
}

const VALID_SEVERITIES = new Set(["safe", "caution", "breaking"]);

function validateAnalysis(parsed) {
  const severity = VALID_SEVERITIES.has(parsed.severity)
    ? parsed.severity
    : "caution";
  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary
      : "Unable to parse summary";
  const breakingItems = Array.isArray(parsed.breakingItems)
    ? parsed.breakingItems.filter((i) => typeof i === "string")
    : [];
  return { severity, summary, breakingItems };
}

export async function analyzeChangelog(
  changelogHtml,
  modName,
  fileName,
  settings,
  modelOverride,
  signal,
) {
  const plainText = truncateText(stripHtml(changelogHtml));
  const userMessage = `Mod: ${modName}\nVersion: ${fileName}\n\nChangelog:\n${plainText}`;

  const headers = { "Content-Type": "application/json" };
  if (settings.llm.apiKey) {
    headers["Authorization"] = `Bearer ${settings.llm.apiKey}`;
  }

  const body = {
    model: modelOverride || settings.llm.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: settings.llm.maxTokens || 1024,
    temperature: settings.llm.temperature ?? 0.1,
  };

  const timeoutSignal = AbortSignal.timeout(30000);
  const fetchSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  const base = settings.llm.endpoint.replace(/\/+$/, '');
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: fetchSignal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`LLM API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const parsed = parseJsonResponse(content);
  return validateAnalysis(parsed);
}

export async function analyzeChangelogs(
  entries,
  modName,
  settings,
  onProgress,
  signal,
) {
  const concurrency = Math.max(1, Math.min(10, settings.llm.concurrency || 2));
  const results = new Array(entries.length);

  // Build list of model instance IDs for round-robin dispatch.
  // LM Studio exposes instances as "model", "model:2", "model:3", etc.
  const baseModel = settings.llm.model;
  const instanceIds = [baseModel];
  for (let n = 2; n <= concurrency; n++) {
    const baseName = baseModel.replace(/:\d+$/, '');
    instanceIds.push(`${baseName}:${n}`);
  }

  for (let i = 0; i < entries.length; i += concurrency) {
    if (signal?.aborted) break;
    const batch = entries.slice(i, i + concurrency);

    const settled = await Promise.allSettled(
      batch.map((entry, j) => {
        if (onProgress) onProgress(entry.fileName);
        return analyzeChangelog(
          entry.changelogHtml,
          modName,
          entry.fileName,
          settings,
          instanceIds[j % instanceIds.length],
          signal,
        ).then((analysis) => ({ index: i + j, entry, analysis }));
      }),
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        const { index, entry, analysis } = result.value;
        results[index] = {
          fileId: entry.fileId,
          fileName: entry.fileName,
          fileDate: entry.fileDate,
          changelogHtml: entry.changelogHtml,
          llmAnalysis: analysis,
        };
      } else {
        const idx = settled.indexOf(result);
        const entry = batch[idx];
        results[i + idx] = {
          fileId: entry.fileId,
          fileName: entry.fileName,
          fileDate: entry.fileDate,
          changelogHtml: entry.changelogHtml,
          llmAnalysis: {
            severity: "caution",
            summary: `LLM analysis failed: ${result.reason?.message || "Unknown error"}`,
            breakingItems: [],
            error: true,
          },
        };
      }
    }
  }

  return results;
}
