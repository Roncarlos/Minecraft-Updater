interface SeverityRule {
  pattern: RegExp;
  tier: 'high' | 'medium' | 'low';
}

export const FILE_SEVERITY_RULES: SeverityRule[] = [
  { pattern: /kubejs\/server_scripts\//i, tier: 'high' },
  { pattern: /kubejs\/startup_scripts\//i, tier: 'high' },
  { pattern: /^scripts\//i, tier: 'high' },
  { pattern: /datapacks?\//i, tier: 'high' },
  { pattern: /config\/(ftbquests|betterquesting|heracles)\//i, tier: 'high' },
  { pattern: /kubejs\/client_scripts\//i, tier: 'medium' },
  { pattern: /config\/openloader\//i, tier: 'medium' },
  { pattern: /patchouli_books\//i, tier: 'medium' },
  { pattern: /config\//i, tier: 'medium' },
  { pattern: /defaultconfigs\//i, tier: 'medium' },
  { pattern: /resourcepacks\//i, tier: 'low' },
];

export function classifyFile(filePath: string): 'high' | 'medium' | 'low' {
  for (const rule of FILE_SEVERITY_RULES) {
    if (rule.pattern.test(filePath)) return rule.tier;
  }
  return 'medium';
}

export interface FileRefEntry {
  filePath: string;
  lines: number[];
}

export function groupFilesByTier(
  files: Record<string, number[]>
): { high: FileRefEntry[]; medium: FileRefEntry[]; low: FileRefEntry[] } {
  const tiers = { high: [] as FileRefEntry[], medium: [] as FileRefEntry[], low: [] as FileRefEntry[] };
  for (const [filePath, lines] of Object.entries(files)) {
    tiers[classifyFile(filePath)].push({ filePath, lines });
  }
  return tiers;
}
