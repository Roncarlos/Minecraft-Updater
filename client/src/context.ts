import { createContext, useContext } from 'react';
import type { AppState, ModalState, Instance, InstanceMeta, ScanProgress, ScanResults, DownloadStateMap, Settings, LlmStatus } from './types';

export const initialState: AppState = {
  instances: [],
  selectedInstance: null,
  instanceMeta: null,
  scanRunning: false,
  scanProgress: null,
  scanResults: null,
  downloadState: {},
  settings: null,
  llmConfigured: false,
  llmStatus: 'unknown',
};

export type AppAction =
  | { type: 'SET_INSTANCES'; instances: Instance[] }
  | { type: 'SET_SELECTED_INSTANCE'; name: string | null }
  | { type: 'SET_INSTANCE_META'; meta: InstanceMeta | null }
  | { type: 'SET_SCAN_RUNNING'; value: boolean }
  | { type: 'SET_SCAN_PROGRESS'; progress: ScanProgress | null }
  | { type: 'SET_SCAN_RESULTS'; results: ScanResults | null }
  | { type: 'SET_DOWNLOAD_STATE'; state: DownloadStateMap }
  | { type: 'MERGE_DOWNLOAD_STATE'; state: DownloadStateMap }
  | { type: 'REMOVE_FROM_DOWNLOAD_STATE'; addonIds: string[] }
  | { type: 'SET_SETTINGS'; settings: Settings }
  | { type: 'SET_LLM_CONFIGURED'; value: boolean }
  | { type: 'SET_LLM_STATUS'; status: LlmStatus };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INSTANCES':
      return { ...state, instances: action.instances };
    case 'SET_SELECTED_INSTANCE':
      return { ...state, selectedInstance: action.name };
    case 'SET_INSTANCE_META':
      return { ...state, instanceMeta: action.meta };
    case 'SET_SCAN_RUNNING':
      return { ...state, scanRunning: action.value };
    case 'SET_SCAN_PROGRESS':
      return { ...state, scanProgress: action.progress };
    case 'SET_SCAN_RESULTS':
      return { ...state, scanResults: action.results };
    case 'SET_DOWNLOAD_STATE':
      return { ...state, downloadState: action.state };
    case 'MERGE_DOWNLOAD_STATE':
      return { ...state, downloadState: { ...state.downloadState, ...action.state } };
    case 'REMOVE_FROM_DOWNLOAD_STATE': {
      const next = { ...state.downloadState };
      for (const id of action.addonIds) delete next[id];
      return { ...state, downloadState: next };
    }
    case 'SET_SETTINGS':
      return { ...state, settings: action.settings };
    case 'SET_LLM_CONFIGURED':
      return { ...state, llmConfigured: action.value, llmStatus: action.value ? state.llmStatus : 'unknown' };
    case 'SET_LLM_STATUS':
      return { ...state, llmStatus: action.status };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
}

export const AppContext = createContext<AppContextValue>(null!);

export function useAppContext() {
  return useContext(AppContext);
}
