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

// ── Download + Apply ──────────────────────────────────────────────────────

export const downloadPresetMods = (presetId: string) =>
  post<ApplyModResult[]>(`/api/modifier/presets/${presetId}/download-mods`, {});

export const applyPreset = (presetId: string, instanceName: string) =>
  post<ApplyPresetResult>(`/api/modifier/presets/${presetId}/apply`, { instanceName });
