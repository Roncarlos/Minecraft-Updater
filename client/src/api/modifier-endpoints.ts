import { get, post, patch, put, del } from './client';
import type {
  PresetSummary,
  Preset,
  PresetMod,
  PresetConfigEntry,
  CfSearchResult,
  CfModFile,
  ApplyModResult,
  ApplyPresetResult,
  RollbackResult,
} from '../types';

// ── Presets ───────────────────────────────────────────────────────────────

export const fetchPresets = () =>
  get<PresetSummary[]>('/api/modifier/presets');

export const createPreset = (name: string, mcVersion?: string, loader?: string) =>
  post<Preset>('/api/modifier/presets', { name, mcVersion, loader });

export const fetchPreset = (id: string) =>
  get<Preset>(`/api/modifier/presets/${id}`);

export const updatePreset = (id: string, updates: Partial<Pick<Preset, 'name' | 'description' | 'mcVersion' | 'loader'>>) =>
  patch<Preset>(`/api/modifier/presets/${id}`, updates);

export const deletePreset = (id: string) =>
  del<{ success: boolean }>(`/api/modifier/presets/${id}`);

// ── CurseForge search ─────────────────────────────────────────────────────

export const searchMods = (q: string, mcVersion?: string, loader?: string) =>
  get<CfSearchResult[]>(`/api/modifier/search?q=${encodeURIComponent(q)}${mcVersion ? `&mcVersion=${encodeURIComponent(mcVersion)}` : ''}${loader ? `&loader=${encodeURIComponent(loader)}` : ''}`);

export const fetchModFiles = (addonId: number, mcVersion?: string, loader?: string) =>
  get<CfModFile[]>(`/api/modifier/mod-files/${addonId}?${mcVersion ? `mcVersion=${encodeURIComponent(mcVersion)}` : ''}${loader ? `&loader=${encodeURIComponent(loader)}` : ''}`);

// ── Preset mods ───────────────────────────────────────────────────────────

export const addPresetMod = (presetId: string, mod: PresetMod) =>
  post<Preset>(`/api/modifier/presets/${presetId}/mods`, mod);

export const removePresetMod = (presetId: string, addonId: number) =>
  del<Preset>(`/api/modifier/presets/${presetId}/mods/${addonId}`);

// ── Config management ─────────────────────────────────────────────────────

export const importConfigs = (presetId: string, folderPath: string) =>
  post<PresetConfigEntry[]>(`/api/modifier/presets/${presetId}/configs/import`, { folderPath });

export const importSingleConfig = (presetId: string, filePath: string) =>
  post<PresetConfigEntry>(`/api/modifier/presets/${presetId}/configs/import-file`, { filePath });

export const uploadConfig = (presetId: string, targetPath: string, content: string) =>
  post<PresetConfigEntry>(`/api/modifier/presets/${presetId}/configs/upload`, { targetPath, content });

export const fetchConfigs = (presetId: string) =>
  get<PresetConfigEntry[]>(`/api/modifier/presets/${presetId}/configs`);

export const fetchConfigContent = (presetId: string, targetPath: string) =>
  get<{ targetPath: string; content: string }>(`/api/modifier/presets/${presetId}/configs/${targetPath}`);

export const saveConfigContent = (presetId: string, targetPath: string, content: string) =>
  put<PresetConfigEntry>(`/api/modifier/presets/${presetId}/configs/${targetPath}`, { content });

export const deleteConfigFile = (presetId: string, targetPath: string) =>
  del<{ success: boolean }>(`/api/modifier/presets/${presetId}/configs/${targetPath}`);

export const openConfigFile = (presetId: string, targetPath: string) =>
  post<{ success: boolean }>(`/api/modifier/presets/${presetId}/configs/open`, { targetPath });

// ── KubeJS management ────────────────────────────────────────────────

export const fetchKubejs = (presetId: string) =>
  get<PresetConfigEntry[]>(`/api/modifier/presets/${presetId}/kubejs`);

export const importKubejs = (presetId: string, folderPath: string) =>
  post<PresetConfigEntry[]>(`/api/modifier/presets/${presetId}/kubejs/import`, { folderPath });

export const importSingleKubejs = (presetId: string, filePath: string) =>
  post<PresetConfigEntry>(`/api/modifier/presets/${presetId}/kubejs/import-file`, { filePath });

export const uploadKubejs = (presetId: string, targetPath: string, content: string, binary: boolean = false) =>
  post<PresetConfigEntry>(`/api/modifier/presets/${presetId}/kubejs/upload`, { targetPath, content, binary });

export const fetchKubejsContent = (presetId: string, targetPath: string) =>
  get<{ targetPath: string; content: string }>(`/api/modifier/presets/${presetId}/kubejs/read/${targetPath}`);

export const saveKubejsContent = (presetId: string, targetPath: string, content: string) =>
  put<PresetConfigEntry>(`/api/modifier/presets/${presetId}/kubejs/${targetPath}`, { content });

export const deleteKubejsFile = (presetId: string, targetPath: string) =>
  del<{ success: boolean }>(`/api/modifier/presets/${presetId}/kubejs/${targetPath}`);

export const openKubejsFile = (presetId: string, targetPath: string) =>
  post<{ success: boolean }>(`/api/modifier/presets/${presetId}/kubejs/open`, { targetPath });

// ── Resource Pack management ─────────────────────────────────────────

export const importResourcepacks = (presetId: string, folderPath: string) =>
  post<PresetConfigEntry[]>(`/api/modifier/presets/${presetId}/resourcepacks/import`, { folderPath });

export const uploadResourcepack = (presetId: string, targetPath: string, content: string) =>
  post<PresetConfigEntry>(`/api/modifier/presets/${presetId}/resourcepacks/upload`, { targetPath, content });

export const deleteResourcepackFile = (presetId: string, targetPath: string) =>
  del<{ success: boolean }>(`/api/modifier/presets/${presetId}/resourcepacks/${targetPath}`);

export const openResourcepackFile = (presetId: string, targetPath: string) =>
  post<{ success: boolean }>(`/api/modifier/presets/${presetId}/resourcepacks/open`, { targetPath });

// ── Download + Apply ──────────────────────────────────────────────────────

export const downloadPresetMods = (presetId: string) =>
  post<ApplyModResult[]>(`/api/modifier/presets/${presetId}/download-mods`, {});

export const applyPreset = (presetId: string, instanceName: string, backup: boolean) =>
  post<ApplyPresetResult>(`/api/modifier/presets/${presetId}/apply`, { instanceName, backup });

export const rollbackPreset = (presetId: string, instanceName: string) =>
  post<RollbackResult>(`/api/modifier/presets/${presetId}/rollback`, { instanceName });

export const hasPresetBackup = (presetId: string, instanceName: string) =>
  get<{ hasBackup: boolean }>(`/api/modifier/presets/${presetId}/has-backup?instanceName=${encodeURIComponent(instanceName)}`);
