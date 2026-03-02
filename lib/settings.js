import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', 'settings.json');

const DEFAULTS = {
  llm: {
    enabled: false,
    endpoint: 'http://localhost:1234/v1',
    apiKey: '',
    model: '',
    maxTokens: 1024,
    temperature: 0.1,
    concurrency: 2,
  },
  cache: {
    maxAgeHours: 24,
    pruneDays: 7,
  },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function migrateEndpoint(settings) {
  if (settings.llm?.endpoint) {
    settings.llm.endpoint = settings.llm.endpoint.replace(/\/chat\/completions\/?$/, '');
  }
  return settings;
}

export async function loadSettings() {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8');
    const saved = JSON.parse(raw);
    return migrateEndpoint(deepMerge(DEFAULTS, saved));
  } catch {
    return { ...DEFAULTS, llm: { ...DEFAULTS.llm }, cache: { ...DEFAULTS.cache } };
  }
}

export async function saveSettings(settings) {
  const merged = migrateEndpoint(deepMerge(DEFAULTS, settings));
  if (merged.cache) {
    merged.cache.maxAgeHours = Math.max(1, Math.min(720, merged.cache.maxAgeHours || DEFAULTS.cache.maxAgeHours));
    merged.cache.pruneDays = Math.max(1, Math.min(90, merged.cache.pruneDays || DEFAULTS.cache.pruneDays));
  }
  await writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
