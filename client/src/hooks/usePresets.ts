import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../api/modifier-endpoints';
import type { PresetSummary, Preset } from '../types';

export function usePresets() {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Load preset list on mount
  useEffect(() => {
    (async () => {
      try {
        const list = await api.fetchPresets();
        setPresets(list);
      } catch (err) {
        console.warn('Failed to load presets:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load full preset when selection changes
  useEffect(() => {
    if (!selectedId) { setSelected(null); setSelecting(false); return; }
    if (selectedRef.current?.id === selectedId) return;
    let cancelled = false;
    setSelecting(true);
    (async () => {
      try {
        const preset = await api.fetchPreset(selectedId);
        if (!cancelled) setSelected(preset);
      } catch (err) {
        console.warn('Failed to load preset:', err);
        if (!cancelled) { setSelected(null); setSelectedId(null); }
      } finally {
        if (!cancelled) setSelecting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const create = useCallback(async (name: string) => {
    const preset = await api.createPreset(name);
    setPresets(prev => [...prev, {
      id: preset.id,
      name: preset.name,
      mcVersion: preset.mcVersion,
      loader: preset.loader,
      modCount: 0,
      configCount: 0,
      kubejsCount: 0,
      resourcepackCount: 0,
      disableModCount: 0,
      fileReplacementCount: 0,
      createdAt: preset.createdAt,
    }]);
    setSelected(preset);
    setSelectedId(preset.id);
  }, []);

  const update = useCallback(async (updates: Partial<Pick<Preset, 'name' | 'description' | 'mcVersion' | 'loader' | 'disableMods' | 'fileReplacements'>>) => {
    if (!selectedId) return;
    const updated = await api.updatePreset(selectedId, updates);
    setSelected(updated);
    setPresets(prev => prev.map(p => p.id === selectedId ? {
      ...p,
      name: updated.name,
      mcVersion: updated.mcVersion,
      loader: updated.loader,
      modCount: updated.mods.length,
      configCount: updated.configs.length,
      kubejsCount: updated.kubejs.length,
      resourcepackCount: updated.resourcepacks.length,
      disableModCount: updated.disableMods.length,
      fileReplacementCount: updated.fileReplacements.length,
    } : p));
  }, [selectedId]);

  const remove = useCallback(async (id: string) => {
    await api.deletePreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelected(null);
    }
  }, [selectedId]);

  const refresh = useCallback(async () => {
    if (!selectedId) return;
    try {
      const preset = await api.fetchPreset(selectedId);
      setSelected(preset);
      setPresets(prev => prev.map(p => p.id === selectedId ? {
        ...p,
        modCount: preset.mods.length,
        configCount: preset.configs.length,
        kubejsCount: preset.kubejs.length,
        resourcepackCount: preset.resourcepacks.length,
        disableModCount: preset.disableMods.length,
        fileReplacementCount: preset.fileReplacements.length,
      } : p));
    } catch (err) { console.warn('Failed to refresh preset:', err); }
  }, [selectedId]);

  const refreshFiles = useCallback(async () => {
    if (!selectedId) return;
    try {
      const preset = await api.refreshPresetFiles(selectedId);
      setSelected(preset);
      setPresets(prev => prev.map(p => p.id === selectedId ? {
        ...p,
        modCount: preset.mods.length,
        configCount: preset.configs.length,
        kubejsCount: preset.kubejs.length,
        resourcepackCount: preset.resourcepacks.length,
        disableModCount: preset.disableMods.length,
        fileReplacementCount: preset.fileReplacements.length,
      } : p));
    } catch (err) { console.warn('Failed to refresh preset files:', err); }
  }, [selectedId]);

  return { presets, selectedId, selected, loading, selecting, select, create, update, remove, refresh, refreshFiles };
}
