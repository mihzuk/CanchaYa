import type { ReactNode } from 'react';

interface AlertProps {
  tone?: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
  onClose?: () => void;
}

export function Alert({ tone = 'info', children, onClose }: AlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="alert__body">{children}</div>
      {onClose && (
        <button type="button" className="alert__close" onClick={onClose} aria-label="Cerrar aviso">
          ×
        </button>
      )}
    </div>
  );
}
