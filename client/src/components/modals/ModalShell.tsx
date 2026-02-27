import { useEffect, useRef } from 'react';

interface ModalShellProps {
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}

export default function ModalShell({ onClose, maxWidth = '600px', children }: ModalShellProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/70 z-[1000] flex justify-center items-center"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-surface border border-border rounded-xl p-6 w-[90%] max-h-[80vh] flex flex-col"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
