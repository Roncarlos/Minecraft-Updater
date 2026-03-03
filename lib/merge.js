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
const WS_DELIM = /[\s,}\]]/;

function snbtRaw(text) {
  return { [SNBT_RAW]: text };
}

function isSnbtRaw(val) {
  return val !== null && typeof val === 'object' && SNBT_RAW in val;
}

const SNBT_ARRAY = Symbol('snbtArray');

function snbtArray(prefix, elements) {
  return { [SNBT_ARRAY]: true, prefix, elements };
}

function isSnbtArray(val) {
  return val !== null && typeof val === 'object' && SNBT_ARRAY in val;
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
    if (peek() === '[') return parseArray();
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

  function parseArray() {
    depth++;
    if (depth > MAX_DEPTH) throw new Error(`SNBT nesting exceeds maximum depth of ${MAX_DEPTH} at position ${pos}`);
    pos++; // skip '['
    skipWs();
    // Check for typed array prefix (B;, I;, L;)
    let prefix = '';
    if (!eof() && /[BIL]/.test(peek()) && pos + 1 < input.length && input[pos + 1] === ';') {
      prefix = advance() + advance();
      skipWs();
    }
    const elements = [];
    while (!eof() && peek() !== ']') {
      const prevPos = pos;
      elements.push(parseValue());
      skipWs();
      if (peek() === ',') pos++;
      skipWs();
      if (pos === prevPos) throw new Error(`SNBT array parse stalled at position ${pos}: unexpected '${peek() || 'EOF'}'`);
    }
    if (!eof()) pos++; // skip ']'
    depth--;
    return snbtArray(prefix, elements);
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
    } else {
      while (!eof() && !WS_DELIM.test(peek())) {
        pos++;
      }
    }
    return snbtRaw(input.slice(start, pos));
  }

  skipWs();
  if (peek() !== '{') throw new Error(`SNBT expected '{' at position ${pos}, found '${peek() || 'EOF'}'`);
  return parseCompound();
}

function serializeSnbtArray(arr, indent) {
  if (arr.elements.length === 0) {
    return arr.prefix ? `[${arr.prefix}]` : '[]';
  }

  // Inline small arrays of raw values
  if (arr.elements.length <= 4 && arr.elements.every(el => isSnbtRaw(el))) {
    const items = arr.elements.map(el => el[SNBT_RAW]).join(', ');
    return arr.prefix ? `[${arr.prefix} ${items}]` : `[${items}]`;
  }

  const tab = '\t'.repeat(indent + 1);
  const closingTab = '\t'.repeat(indent);

  const lines = arr.elements.map(el => `${tab}${serializeSnbt(el, indent + 1)},`);

  const header = arr.prefix ? `[${arr.prefix}\n` : `[\n`;
  return `${header}${lines.join('\n')}\n${closingTab}]`;
}

function serializeSnbt(value, indent = 0) {
  if (isSnbtRaw(value)) return value[SNBT_RAW];
  if (isSnbtArray(value)) return serializeSnbtArray(value, indent);
  if (typeof value !== 'object' || value === null) return String(value);

  const entries = Object.entries(value);
  if (entries.length === 0) return '{ }';

  // Inline simple compounds (all values are raw and few keys)
  if (entries.length <= 3 && entries.every(([, v]) => isSnbtRaw(v))) {
    const parts = entries.map(([key, val]) => {
      const needsQuote = !SAFE_KEY.test(key);
      const quotedKey = needsQuote ? `"${key}"` : key;
      return `${quotedKey}: ${val[SNBT_RAW]}`;
    });
    return `{ ${parts.join(', ')} }`;
  }

  const tab = '\t'.repeat(indent + 1);
  const closingTab = '\t'.repeat(indent);

  const lines = entries.map(([key, val]) => {
    const needsQuote = !SAFE_KEY.test(key);
    const quotedKey = needsQuote ? `"${key}"` : key;
    return `${tab}${quotedKey}: ${serializeSnbt(val, indent + 1)},`;
  });

  return `{\n${lines.join('\n')}\n${closingTab}}`;
}

function mergeSnbtArrays(t, s) {
  // Warn on typed array prefix mismatch
  if (t.prefix && s.prefix && t.prefix !== s.prefix) {
    console.warn(`[merge] SNBT typed array prefix mismatch: target "${t.prefix}" vs source "${s.prefix}", keeping target prefix`);
  }

  // Index existing compound elements by id
  const idIndex = new Map();
  const merged = t.elements.map((el, i) => {
    if (!isSnbtRaw(el) && !isSnbtArray(el) && 'id' in el) {
      const idStr = isSnbtRaw(el.id) ? el.id[SNBT_RAW] : String(el.id);
      idIndex.set(idStr, i);
    }
    return el;
  });

  // Set of raw values for primitive dedup
  const rawSet = new Set(
    merged.filter(el => isSnbtRaw(el)).map(el => el[SNBT_RAW])
  );

  // Structural dedup for non-id, non-raw elements (compounds without id, nested arrays)
  const structSet = new Set(
    merged
      .filter(el => !isSnbtRaw(el) && !(!isSnbtRaw(el) && !isSnbtArray(el) && 'id' in el))
      .map(el => serializeSnbt(el))
  );

  for (const el of s.elements) {
    if (!isSnbtRaw(el) && !isSnbtArray(el) && 'id' in el) {
      const idStr = isSnbtRaw(el.id) ? el.id[SNBT_RAW] : String(el.id);
      if (idIndex.has(idStr)) {
        // Merge existing compound by id
        const idx = idIndex.get(idStr);
        merged[idx] = mergeSnbtObjects(merged[idx], el);
      } else {
        idIndex.set(idStr, merged.length);
        merged.push(el);
      }
    } else if (isSnbtRaw(el)) {
      if (!rawSet.has(el[SNBT_RAW])) {
        rawSet.add(el[SNBT_RAW]);
        merged.push(el);
      }
    } else {
      const key = serializeSnbt(el);
      if (!structSet.has(key)) {
        structSet.add(key);
        merged.push(el);
      }
    }
  }

  return snbtArray(t.prefix || s.prefix, merged);
}

function mergeSnbtObjects(t, s) {
  const result = Object.assign(Object.create(null), t);
  for (const key of Object.keys(s)) {
    const tVal = result[key];
    const sVal = s[key];
    if (key in result && isSnbtArray(tVal) && isSnbtArray(sVal)) {
      result[key] = mergeSnbtArrays(tVal, sVal);
    } else if (key in result && !isSnbtRaw(tVal) && !isSnbtArray(tVal) && !isSnbtRaw(sVal) && !isSnbtArray(sVal)) {
      result[key] = mergeSnbtObjects(tVal, sVal);
    } else {
      result[key] = sVal;
    }
  }
  return result;
}

export function deepMergeSnbt(targetSnbt, sourceSnbt) {
  const target = parseSnbtCompound(targetSnbt);
  const source = parseSnbtCompound(sourceSnbt);
  return serializeSnbt(mergeSnbtObjects(target, source)) + '\n';
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
