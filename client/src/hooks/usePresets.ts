import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/modifier-endpoints';
import type { PresetSummary, Preset } from '../types';

export function usePresets() {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (!selectedId) { setSelected(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const preset = await api.fetchPreset(selectedId);
        if (!cancelled) setSelected(preset);
      } catch (err) {
        console.warn('Failed to load preset:', err);
        if (!cancelled) { setSelected(null); setSelectedId(null); }
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
      createdAt: preset.createdAt,
    }]);
    setSelectedId(preset.id);
    setSelected(preset);
  }, []);

  const update = useCallback(async (updates: Partial<Pick<Preset, 'name' | 'description' | 'mcVersion' | 'loader'>>) => {
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
      } : p));
    } catch (err) { console.warn('Failed to refresh preset:', err); }
  }, [selectedId]);

  return { presets, selectedId, selected, loading, select, create, update, remove, refresh };
}
