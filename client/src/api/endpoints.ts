import { get, post } from './client';
import type {
  Instance,
  InstanceMeta,
  Settings,
  RefsResponse,
  DownloadStateMap,
} from '../types';

// ── Instances ──────────────────────────────────────────────────────────────

export const fetchInstances = () =>
  get<{ instances: Instance[]; selected: string }>('/api/instances');

export const selectInstance = (name: string) =>
  post<InstanceMeta>('/api/instance/select', { name });

export const fetchInstance = () =>
  get<InstanceMeta>('/api/instance');

// ── Scan ───────────────────────────────────────────────────────────────────

export const fetchScanResults = () =>
  get<import('../types').ScanResults>('/api/scan/results');

export const cancelScan = () =>
  post<{ success: boolean }>('/api/scan/cancel', {});

// ── Config refs ────────────────────────────────────────────────────────────

export const fetchConfigRefs = (addonId: number) =>
  get<RefsResponse>(`/api/config-refs/${addonId}`);

// ── Open file ─────────────────────────────────────────────────────────────

export const openFile = (filePath: string, line?: number) =>
  post<{ success: boolean; error?: string }>('/api/open-file', { filePath, line });

// ── Download ───────────────────────────────────────────────────────────────

export const downloadMod = (addonId: number, downloadUrl: string, fileName: string) =>
  post<{ success: boolean; error?: string }>('/api/download', { addonId, downloadUrl, fileName });

export const downloadBulk = (mods: { addonId: number; downloadUrl: string; fileName: string }[]) =>
  post<{ addonId: number; success: boolean; error?: string }[]>('/api/download/bulk', { mods });

// ── Apply ──────────────────────────────────────────────────────────────────

export const applyMod = (addonId: number, oldFileName: string, newFileName: string) =>
  post<{ success: boolean; addonId: number; oldFileName: string; newFileName: string; error?: string }>('/api/apply', { addonId, oldFileName, newFileName });

export const applyBulk = (mods: { addonId: number; oldFileName: string; newFileName: string }[]) =>
  post<{ addonId: number; success: boolean; oldFileName: string; newFileName: string; error?: string }[]>('/api/apply/bulk', { mods });

// ── Rollback ───────────────────────────────────────────────────────────────

export const rollbackMod = (addonId: number, oldFileName: string, newFileName: string) =>
  post<{ success: boolean; error?: string }>('/api/rollback', { addonId, oldFileName, newFileName });

export const rollbackBulk = (mods: { addonId: number; oldFileName: string; newFileName: string }[]) =>
  post<{ addonId: number; success: boolean; error?: string }[]>('/api/rollback/bulk', { mods });

// ── Download state ─────────────────────────────────────────────────────────

export const fetchDownloadState = () =>
  get<DownloadStateMap>('/api/download-state');

// ── Settings ───────────────────────────────────────────────────────────────

export const fetchSettings = () =>
  get<Settings>('/api/settings');

export const saveSettings = (settings: Settings) =>
  post<Settings>('/api/settings', settings);

export const testLlmConnection = () =>
  post<{ success: boolean; response?: string; error?: string }>('/api/settings/test-llm', {});

export const detectConcurrency = () =>
  get<{ success: boolean; instances?: number; models?: string[]; error?: string }>('/api/settings/detect-concurrency');
