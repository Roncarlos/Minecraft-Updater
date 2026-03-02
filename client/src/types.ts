// ── Instance types ──────────────────────────────────────────────────────────

export interface Instance {
  name: string;
  path: string;
  mcVersion: string;
  loaderName: string;
}

export interface InstanceMeta {
  instanceName: string;
  mcVersion: string;
  loaderName: string;
  modCount: number;
}

// ── Scan types ─────────────────────────────────────────────────────────────

export interface LlmAnalysis {
  severity: 'safe' | 'caution' | 'breaking';
  summary: string;
  breakingItems?: string[];
}

export interface LlmChangelog {
  fileName: string;
  fileDate: string;
  changelogHtml: string;
  llmAnalysis?: LlmAnalysis;
}

export interface FlaggedChangelog {
  fileName: string;
  fileDate: string;
  keywords: string[];
  changelogHtml: string;
}

export interface RefSeverity {
  severity: 'high' | 'medium' | 'low';
}

export interface ModItem {
  addonID: number;
  name: string;
  url?: string;
  installedFile: string;
  latestFile?: string;
  downloadUrl?: string;
  hasUpdate: boolean;
  breakingReason?: string;
  refs?: number;
  refSeverity?: RefSeverity;
  dependencies?: number[];
  flaggedChangelogs?: FlaggedChangelog[];
  llmChangelogs?: LlmChangelog[];
}

export interface DependencyNode {
  deps: number[];
  reverseDeps: number[];
}

export interface DependencyGraph {
  [addonId: string]: DependencyNode;
}

export interface MissingDep {
  addonId: number;
  neededBy: number[];
}

export interface ScanResults {
  metadata: {
    mcVersion: string;
    loaderName: string;
    totalMods: number;
    scanDate: string;
  };
  breaking: ModItem[];
  caution: ModItem[];
  reviewDeps: ModItem[];
  safeToUpdate: ModItem[];
  updates: ModItem[];
  upToDate: ModItem[];
  errors: { addonID: number; name: string; error: string }[];
  dependencyGraph?: DependencyGraph;
  missingDeps?: MissingDep[];
}

export interface ScanProgress {
  current: number;
  total: number;
  modName: string;
  source: string;
}

// ── Download state ─────────────────────────────────────────────────────────

export interface DownloadStateEntry {
  status: 'downloaded' | 'applied' | 'error';
  fileName?: string;
  oldFileName?: string;
  newFileName?: string;
}

export type DownloadStateMap = Record<string, DownloadStateEntry>;

// ── Settings ───────────────────────────────────────────────────────────────

export interface LlmSettings {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  concurrency: number;
}

export interface CacheSettings {
  maxAgeHours: number;
  pruneDays: number;
}

export interface Settings {
  llm: LlmSettings;
  cache: CacheSettings;
}

// ── LLM status ──────────────────────────────────────────────────────────────

export type LlmStatus = 'unknown' | 'online' | 'offline';

// ── Refs ───────────────────────────────────────────────────────────────────

export interface RefsResponse {
  addonId: string;
  files: Record<string, number[]>;
  severity: RefSeverity | null;
}

// ── Modal state ────────────────────────────────────────────────────────────

export type ModalState =
  | { type: 'none' }
  | { type: 'refs'; addonId: number; modName: string }
  | { type: 'deps'; addonId: number; modName: string }
  | { type: 'changelog'; addonId: number; modName: string }
  | { type: 'apply'; mods: { addonId: number; oldFileName: string; newFileName: string }[]; extraDeps: ModItem[]; title: string; onConfirm: () => void }
  | { type: 'settings' }
  | { type: 'mod-file-picker'; addonId: number; modName: string; presetId: string; mcVersion: string; loader: string; onAdded: () => void }
  | { type: 'config-editor'; presetId: string; targetPath: string; content: string; onSave: (content: string) => Promise<void> }
  | { type: 'apply-results'; result: ApplyPresetResult };

// ── Modifier types ────────────────────────────────────────────────────────

export interface PresetSummary {
  id: string;
  name: string;
  mcVersion: string;
  loader: string;
  modCount: number;
  configCount: number;
  kubejsCount: number;
  resourcepackCount: number;
  createdAt: string;
}

export interface PresetMod {
  addonId: number;
  name: string;
  fileId: number;
  fileName: string;
  downloadUrl: string;
  thumbnailUrl?: string;
}

export interface PresetConfigEntry {
  targetPath: string;
  sizeBytes: number;
  isText?: boolean;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  mcVersion: string;
  loader: string;
  createdAt: string;
  mods: PresetMod[];
  configs: PresetConfigEntry[];
  kubejs: PresetConfigEntry[];
  resourcepacks: PresetConfigEntry[];
}

export interface CfSearchResult {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  authors: { name: string }[];
  logo?: { thumbnailUrl: string };
  categories: { name: string }[];
}

export interface CfModFile {
  id: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  downloadUrl: string;
  gameVersions: string[];
  fileLength: number;
}

export interface ApplyModResult {
  addonId: number;
  fileName: string;
  success: boolean;
  error?: string;
}

export interface ApplyConfigResult {
  targetPath: string;
  action: 'merged' | 'replaced' | 'created';
  backedUp: boolean;
  success: boolean;
  error?: string;
}

export interface ApplyCategoryResult {
  targetPath: string;
  success: boolean;
  error?: string;
}

export interface ApplyPresetResult {
  presetName: string;
  instanceName: string;
  mods: ApplyModResult[];
  configs: ApplyConfigResult[];
  kubejs: ApplyCategoryResult[];
  resourcepacks: ApplyCategoryResult[];
  errors: string[];
}

// ── App state ──────────────────────────────────────────────────────────────

export interface AppState {
  instances: Instance[];
  selectedInstance: string | null;
  instanceMeta: InstanceMeta | null;
  scanRunning: boolean;
  scanProgress: ScanProgress | null;
  scanResults: ScanResults | null;
  downloadState: DownloadStateMap;
  settings: Settings | null;
  llmConfigured: boolean;
  llmStatus: LlmStatus;
}
