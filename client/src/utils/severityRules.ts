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

export function groupFilesByTier(files: string[]): { high: string[]; medium: string[]; low: string[] } {
  const tiers = { high: [] as string[], medium: [] as string[], low: [] as string[] };
  for (const file of files) {
    tiers[classifyFile(file)].push(file);
  }
  return tiers;
}
