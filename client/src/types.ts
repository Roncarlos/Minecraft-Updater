// ── Instance types ──────────────────────────────────────────────────────────

export interface Instance {
  name: string;
  path: string;
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
  | { type: 'settings' };

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
