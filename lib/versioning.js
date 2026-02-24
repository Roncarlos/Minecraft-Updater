/**
 * Extract a semver-like version string from a mod filename.
 * Strips .jar extension, MC version patterns, and loader tags first.
 */
export function extractSemver(fileName) {
  if (!fileName) return null;
  // Remove .jar extension
  let name = fileName.replace(/\.jar$/i, '');
  // Remove common MC version patterns
  let stripped = name
    .replace(/[_\-+]mc?1\.\d+(\.\d+)?/gi, '')
    .replace(/_mc1\.\d+(\.\d+)?/gi, '');
  // Remove loader tags
  stripped = stripped
    .replace(/(?:[\-_])?(?:neo)?forge(?:[\-_])?/gi, '-')
    .replace(/(?:[\-_])?fabric(?:[\-_])?/gi, '-')
    .replace(/(?:[\-_])?quilt(?:[\-_])?/gi, '-');
  // Find version-like patterns
  let match = stripped.match(/(\d+\.\d+\.\d+)/);
  if (match) return match[1];
  match = stripped.match(/(\d+\.\d+)/);
  if (match) return match[1] + '.0';
  return null;
}

/**
 * Detect if a version change represents a significant (major/minor) bump.
 */
export function detectVersionBump(oldVer, newVer) {
  if (!oldVer || !newVer) return { isBump: false, type: null };
  const oldParts = oldVer.split('.');
  const newParts = newVer.split('.');
  const oldMajor = oldParts[0];
  const newMajor = newParts[0];
  const oldMinor = oldParts.length > 1 ? oldParts[1] : '0';
  const newMinor = newParts.length > 1 ? newParts[1] : '0';

  if (/^\d+$/.test(oldMajor) && /^\d+$/.test(newMajor)) {
    if (parseInt(newMajor) > parseInt(oldMajor)) {
      return { isBump: true, type: 'Major' };
    }
  }
  if (oldMajor === newMajor && /^\d+$/.test(oldMinor) && /^\d+$/.test(newMinor)) {
    if (parseInt(newMinor) > parseInt(oldMinor)) {
      return { isBump: true, type: 'Minor' };
    }
  }
  return { isBump: false, type: null };
}

/**
 * Shared keyword list for breaking-change detection in changelogs.
 */
const BREAKING_KEYWORDS = [
  'breaking', 'remove', 'removed', 'incompatible', 'migration', 'deprecated',
  'breaking change', 'not compatible', 'requires migration',
  'deleted', 'dropped', 'no longer supported', 'no longer available',
  'renamed', 'replaced', 'overhauled', 'reworked', 'rewritten',
];

/**
 * Strip HTML tags for plain-text snippet extraction.
 */
export function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Find breaking-change keywords in changelog text and return context snippets.
 * Returns array of { keyword, snippet } where snippet is ~200 chars around the match.
 */
export function findBreakingSnippets(html) {
  if (!html) return [];
  const plain = stripHtml(html);
  const lower = plain.toLowerCase();
  const results = [];
  const seen = new Set();

  for (const kw of BREAKING_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    let match;
    while ((match = regex.exec(lower)) !== null) {
      const key = `${kw}@${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(0, match.index - 100);
      const end = Math.min(plain.length, match.index + kw.length + 100);
      const snippet = (start > 0 ? '...' : '') + plain.slice(start, end).trim() + (end < plain.length ? '...' : '');
      results.push({ keyword: kw, snippet });
    }
  }

  return results;
}

/**
 * Check changelog text for breaking-change keywords.
 */
export function hasBreakingKeywords(text) {
  return findBreakingSnippets(text).length > 0;
}
