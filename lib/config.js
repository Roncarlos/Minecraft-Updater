import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const INSTANCES_ROOT = join(homedir(), 'curseforge', 'minecraft', 'Instances');
export const CACHE_PATH = join(ROOT, 'ModUpdateCache.json');
export const DOWNLOADS_PATH = join(ROOT, 'downloads');
export const BACKUPS_PATH = join(ROOT, 'backups');
export const PORT = 3000;

export const API_KEY = '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';
export const API_BASE = 'https://api.curseforge.com/v1';
export const RATE_LIMIT_MS = 100;

export const LOADER_MAP = {
  1: 'Forge',
  4: 'Fabric',
  5: 'Quilt',
  6: 'NeoForge',
};

export const EXCLUDED_MOD_IDS = new Set([
  'minecraft', 'c', 'neoforge', 'forge', 'http', 'https', 'java', 'net', 'com', 'org',
  'data', 'type', 'id', 'tag', 'key', 'value', 'true', 'false', 'modid', 'default',
  'null', 'name', 'text', 'file', 'item', 'block', 'entity', 'sound', 'model', 'texture',
  'assets', 'recipes', 'loot', 'tags', 'en', 'us', 'the', 'and', 'not', 'for', 'this',
  'that', 'with', 'from', 'have', 'are', 'all', 'any', 'its', 'class', 'mixin', 'asm',
  'fabric', 'quilt',
]);

export const CONFIG_EXTENSIONS = ['*.toml', '*.json', '*.json5', '*.cfg', '*.js', '*.zs', '*.groovy', '*.mcfunction', '*.snbt', '*.mjs'];
export const MOD_REF_REGEX = /([a-z][a-z0-9_]{1,30}):([a-z][a-z0-9_/]{1,60})/g;

export const FILE_SEVERITY_RULES = [
  // HIGH — scripts & progression
  { pattern: /kubejs\/server_scripts\//i, tier: 'high' },
  { pattern: /kubejs\/startup_scripts\//i, tier: 'high' },
  { pattern: /^scripts\//i, tier: 'high' },
  { pattern: /datapacks?\//i, tier: 'high' },
  { pattern: /config\/(ftbquests|betterquesting|heracles)\//i, tier: 'high' },
  // MEDIUM — config & settings
  { pattern: /kubejs\/client_scripts\//i, tier: 'medium' },
  { pattern: /config\/openloader\//i, tier: 'medium' },
  { pattern: /patchouli_books\//i, tier: 'medium' },
  { pattern: /config\//i, tier: 'medium' },
  { pattern: /defaultconfigs\//i, tier: 'medium' },
  // LOW — visual
  { pattern: /resourcepacks\//i, tier: 'low' },
];
