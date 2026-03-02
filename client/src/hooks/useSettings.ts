import { useCallback } from 'react';
import { useAppContext } from '../context';
import {
  fetchSettings,
  saveSettings as apiSaveSettings,
  testLlmConnection,
  detectConcurrency,
  fetchModels,
} from '../api/endpoints';
import { isLlmConfigured } from '../utils/llmConfigured';
import type { Settings } from '../types';

export function useSettings() {
  const { state, dispatch } = useAppContext();

  const loadSettings = useCallback(async () => {
    const settings = await fetchSettings();
    dispatch({ type: 'SET_SETTINGS', settings });
    dispatch({ type: 'SET_LLM_CONFIGURED', value: isLlmConfigured(settings) });
    return settings;
  }, [dispatch]);

  const saveAndReload = useCallback(async (settings: Settings) => {
    const saved = await apiSaveSettings(settings);
    dispatch({ type: 'SET_SETTINGS', settings: saved });
    dispatch({ type: 'SET_LLM_CONFIGURED', value: isLlmConfigured(saved) });
    return saved;
  }, [dispatch]);

  return {
    settings: state.settings,
    llmConfigured: state.llmConfigured,
    loadSettings,
    saveSettings: saveAndReload,
    testLlm: testLlmConnection,
    detectConcurrency,
    fetchModels,
  };
}
