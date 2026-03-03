import { readFile, writeFile, mkdir, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, extname } from 'path';

// ── Deep merge utility ────────────────────────────────────────────────────

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Deep merge source into target.
 * - Objects are recursively merged (new keys added, existing keys overridden by source)
 * - Arrays are replaced entirely by source
 * - Primitives are replaced by source
 */
export function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ── JSON merge ────────────────────────────────────────────────────────────

export function deepMergeJson(targetJson, sourceJson) {
  const target = JSON.parse(targetJson);
  const source = JSON.parse(sourceJson);
  return JSON.stringify(deepMerge(target, source), null, 2);
}

// ── TOML merge ────────────────────────────────────────────────────────────

let smolToml = null;

async function getTomlParser() {
  if (!smolToml) {
    smolToml = await import('smol-toml');
  }
  return smolToml;
}

export async function deepMergeToml(targetToml, sourceToml) {
  const toml = await getTomlParser();
  const target = toml.parse(targetToml);
  const source = toml.parse(sourceToml);
  const merged = deepMerge(target, source);
  return toml.stringify(merged);
}

// ── SNBT merge ───────────────────────────────────────────────────────

const SNBT_RAW = Symbol('snbtRaw');
const MAX_DEPTH = 64;
const KEY_CHAR = /[a-zA-Z0-9._+\-]/;
const SAFE_KEY = /^[a-zA-Z0-9._+\-]+$/;
const WS_DELIM = /[\s,}]/;

function snbtRaw(text) {
  return { [SNBT_RAW]: text };
}

function isSnbtRaw(val) {
  return val !== null && typeof val === 'object' && SNBT_RAW in val;
}

function parseSnbtCompound(input) {
  let pos = 0;
  let depth = 0;

  function peek() { return pos < input.length ? input[pos] : ''; }
  function advance() { return input[pos++]; }
  function eof() { return pos >= input.length; }

  function skipWs() {
    while (!eof()) {
      const ch = peek();
      if (/\s/.test(ch)) {
        pos++;
      } else if (ch === '/' && input[pos + 1] === '/') {
        while (!eof() && peek() !== '\n') pos++;
      } else {
        break;
      }
    }
  }

  function parseValue() {
    skipWs();
    if (peek() === '{') return parseCompound();
    return captureRawValue();
  }

  function parseCompound() {
    depth++;
    if (depth > MAX_DEPTH) throw new Error(`SNBT nesting exceeds maximum depth of ${MAX_DEPTH} at position ${pos}`);
    pos++; // skip '{'
    const obj = Object.create(null);
    skipWs();
    while (!eof() && peek() !== '}') {
      const prevPos = pos;
      const key = parseKey();
      skipWs();
      if (peek() === ':') pos++;
      skipWs();
      if (key in obj) console.warn(`[merge] SNBT duplicate key "${key}" at position ${pos}, later value wins`);
      obj[key] = parseValue();
      skipWs();
      if (peek() === ',') pos++;
      skipWs();
      if (pos === prevPos) throw new Error(`SNBT parse stalled at position ${pos}: unexpected '${peek() || 'EOF'}'`);
    }
    if (!eof()) pos++; // skip '}'
    depth--;
    return obj;
  }

  function parseKey() {
    skipWs();
    if (peek() === '"') return parseQuoted('"');
    if (peek() === "'") return parseQuoted("'");
    const start = pos;
    while (!eof() && KEY_CHAR.test(peek())) pos++;
    if (pos === start) throw new Error(`SNBT expected a key at position ${pos}, found '${peek() || 'EOF'}'`);
    return input.slice(start, pos);
  }

  function parseQuoted(quote) {
    pos++; // skip opening quote
    const start = pos;
    while (!eof() && peek() !== quote) {
      if (peek() === '\\') pos++;
      pos++;
    }
    const str = input.slice(start, pos);
    if (!eof()) pos++; // skip closing quote
    return str;
  }

  function captureRawValue() {
    const start = pos;
    const ch = peek();
    if (ch === '"' || ch === "'") {
      pos++; // skip opening quote
      while (!eof() && peek() !== ch) {
        if (peek() === '\\') pos++;
        pos++;
      }
      if (!eof()) pos++; // skip closing quote
    } else if (ch === '[') {
      skipBrackets();
    } else {
      while (!eof() && !WS_DELIM.test(peek())) {
        pos++;
      }
    }
    return snbtRaw(input.slice(start, pos));
  }

  function skipBrackets() {
    let sqDepth = 0;
    let brDepth = 0;
    while (!eof()) {
      const ch = advance();
      if (ch === '"' || ch === "'") {
        while (!eof() && peek() !== ch) {
          if (peek() === '\\') pos++;
          pos++;
        }
        if (!eof()) pos++;
      } else if (ch === '{') {
        brDepth++;
      } else if (ch === '}') {
        brDepth--;
      } else if (ch === '[') {
        sqDepth++;
      } else if (ch === ']') {
        sqDepth--;
        if (sqDepth === 0) break;
      }
    }
  }

  skipWs();
  if (peek() !== '{') throw new Error(`SNBT expected '{' at position ${pos}, found '${peek() || 'EOF'}'`);
  return parseCompound();
}

function serializeSnbt(value, indent = 0) {
  if (isSnbtRaw(value)) return value[SNBT_RAW];
  if (typeof value !== 'object' || value === null) return String(value);

  const entries = Object.entries(value);
  if (entries.length === 0) return '{ }';

  const tab = '\t'.repeat(indent + 1);
  const closingTab = '\t'.repeat(indent);

  const lines = entries.map(([key, val]) => {
    const needsQuote = !SAFE_KEY.test(key);
    const quotedKey = needsQuote ? `"${key}"` : key;
    return `${tab}${quotedKey}: ${serializeSnbt(val, indent + 1)},`;
  });

  return `{\n${lines.join('\n')}\n${closingTab}}`;
}

export function deepMergeSnbt(targetSnbt, sourceSnbt) {
  const target = parseSnbtCompound(targetSnbt);
  const source = parseSnbtCompound(sourceSnbt);

  function mergeObjects(t, s) {
    const result = Object.assign(Object.create(null), t);
    for (const key of Object.keys(s)) {
      if (key in result && !isSnbtRaw(result[key]) && !isSnbtRaw(s[key])) {
        result[key] = mergeObjects(result[key], s[key]);
      } else {
        result[key] = s[key];
      }
    }
    return result;
  }

  return serializeSnbt(mergeObjects(target, source)) + '\n';
}

// ── Backup utility ────────────────────────────────────────────────────────

export async function backupFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.${timestamp}.bak`;
  await cp(filePath, backupPath);
  return backupPath;
}

// ── Main merge dispatcher ─────────────────────────────────────────────────

/**
 * Merge a preset config file into an instance destination.
 * Returns { action, backedUp }
 */
export async function mergeConfigFile(srcPath, destPath) {
  const srcContent = await readFile(srcPath, 'utf-8');
  await mkdir(dirname(destPath), { recursive: true });

  // If destination doesn't exist, just copy
  if (!existsSync(destPath)) {
    await writeFile(destPath, srcContent, 'utf-8');
    return { action: 'created', backedUp: false };
  }

  const ext = extname(destPath).toLowerCase();
  const destContent = await readFile(destPath, 'utf-8');

  // JSON / JSON5 — deep merge
  if (ext === '.json' || ext === '.json5') {
    try {
      await backupFile(destPath);
      const merged = deepMergeJson(destContent, srcContent);
      await writeFile(destPath, merged, 'utf-8');
      return { action: 'merged', backedUp: true };
    } catch (err) {
      console.warn(`[merge] JSON merge failed for ${destPath}, falling back to replace: ${err.message}`);
    }
  }

  // TOML — deep merge
  if (ext === '.toml') {
    try {
      await backupFile(destPath);
      const merged = await deepMergeToml(destContent, srcContent);
      await writeFile(destPath, merged, 'utf-8');
      return { action: 'merged', backedUp: true };
    } catch (err) {
      console.warn(`[merge] TOML merge failed for ${destPath}, falling back to replace: ${err.message}`);
    }
  }

  // SNBT — deep merge
  if (ext === '.snbt') {
    try {
      await backupFile(destPath);
      const merged = deepMergeSnbt(destContent, srcContent);
      await writeFile(destPath, merged, 'utf-8');
      return { action: 'merged', backedUp: true };
    } catch (err) {
      console.warn(`[merge] SNBT merge failed for ${destPath}, falling back to replace: ${err.message}`);
    }
  }

  // Everything else — replace with backup
  await backupFile(destPath);
  await writeFile(destPath, srcContent, 'utf-8');
  return { action: 'replaced', backedUp: true };
}
