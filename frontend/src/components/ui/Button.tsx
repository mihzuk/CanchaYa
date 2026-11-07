import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const clases = ['btn', `btn--${variant}`, block ? 'btn--block' : '', className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={clases} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="spinner spinner--sm" aria-hidden="true" />}
      {children}
    </button>
  );
}
