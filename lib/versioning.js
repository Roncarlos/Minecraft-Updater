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
 * Check changelog text for breaking-change keywords.
 */
export function hasBreakingKeywords(text) {
  if (!text) return false;
  const keywords = [
    'breaking', 'removed', 'incompatible', 'migration', 'deprecated',
    'breaking change', 'not compatible', 'requires migration',
  ];
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) return true;
  }
  return false;
}
