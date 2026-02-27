/**
 * Lightweight HTML-to-plain-text converter for changelogs.
 * No external dependencies — just regex-based tag stripping and entity decoding.
 */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function decodeEntities(text) {
  return text
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, m => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function htmlToText(html) {
  if (!html) return '';

  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|tr|blockquote)>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');

  text = decodeEntities(text);

  // Collapse 3+ newlines → 2, trim each line
  text = text
    .split('\n')
    .map(l => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
