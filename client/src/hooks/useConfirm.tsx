import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import ModalShell from '../components/modals/ModalShell';
import Button from '../components/ui/Button';

interface ConfirmOptions {
  confirmLabel?: string;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmState {
  message: string;
  confirmLabel: string;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    return () => {
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    resolveRef.current?.(false);
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setState({ message, confirmLabel: options?.confirmLabel ?? 'Confirm' });
    });
  }, []);

  const handleResult = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ModalShell onClose={() => handleResult(false)} maxWidth="400px">
          <p className="text-text text-[0.9rem] mb-4">{state.message}</p>
          <div className="flex justify-end gap-2">
            <Button variant="cancel" size="sm" onClick={() => handleResult(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => handleResult(true)} autoFocus>{state.confirmLabel}</Button>
          </div>
        </ModalShell>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
