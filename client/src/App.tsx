import { useReducer, useState, useEffect, useCallback, useMemo } from 'react';
import { AppContext, appReducer, initialState } from './context';
import { fetchInstances, fetchSettings, fetchInstance } from './api/endpoints';
import { isLlmConfigured } from './utils/llmConfigured';
import { useLlmHeartbeat } from './hooks/useLlmHeartbeat';
import TabNav from './components/layout/TabNav';
import type { TabId } from './components/layout/TabNav';
import Header from './components/layout/Header';
import ControlsBar from './components/layout/ControlsBar';
import ProgressBar from './components/layout/ProgressBar';
import Footer from './components/layout/Footer';
import ResultsContainer from './components/results/ResultsContainer';
import ModifierPage from './components/modifier/ModifierPage';
import ModalHost from './components/modals/ModalHost';
import type { ModalState } from './types';

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [activeTab, setActiveTab] = useState<TabId>('updater');
  useLlmHeartbeat(state.llmConfigured, dispatch);

  // Load instances + settings on mount
  useEffect(() => {
    (async () => {
      try {
        const [instData, settings] = await Promise.all([
          fetchInstances(),
          fetchSettings(),
        ]);
        dispatch({ type: 'SET_INSTANCES', instances: instData.instances });
        dispatch({ type: 'SET_SELECTED_INSTANCE', name: instData.selected });
        dispatch({ type: 'SET_SETTINGS', settings });
        const configured = isLlmConfigured(settings);
        dispatch({ type: 'SET_LLM_CONFIGURED', value: configured });
      } catch (err) {
        console.error('Failed to load instances/settings:', err);
      }

      // Load current instance meta
      try {
        const meta = await fetchInstance();
        dispatch({ type: 'SET_INSTANCE_META', meta });
      } catch (err) {
        console.error('Failed to load instance meta:', err);
      }
    })();
  }, []);

  const openModal = useCallback((m: ModalState) => setModal(m), []);
  const closeModal = useCallback(() => setModal({ type: 'none' }), []);

  const contextValue = useMemo(
    () => ({ state, dispatch, openModal, closeModal }),
    [state, dispatch, openModal, closeModal],
  );

  return (
    <AppContext.Provider value={contextValue}>
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'updater' && (
        <>
          <Header />
          <ControlsBar />
          <ProgressBar />
          <ResultsContainer />
        </>
      )}
      {activeTab === 'modifier' && <ModifierPage />}
      <Footer />
      <ModalHost modal={modal} />
    </AppContext.Provider>
  );
}
