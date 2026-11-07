import type { HTMLAttributes } from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`card ${className}`.trim()}>
      {children}
    </div>
  );
}
