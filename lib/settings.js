import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', 'settings.json');

const DEFAULTS = {
  llm: {
    enabled: false,
    endpoint: 'http://localhost:1234/v1/chat/completions',
    apiKey: '',
    model: '',
    maxTokens: 1024,
    temperature: 0.1,
    concurrency: 2,
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

export async function loadSettings() {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8');
    const saved = JSON.parse(raw);
    return deepMerge(DEFAULTS, saved);
  } catch {
    return { ...DEFAULTS, llm: { ...DEFAULTS.llm } };
  }
}

export async function saveSettings(settings) {
  const merged = deepMerge(DEFAULTS, settings);
  await writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
