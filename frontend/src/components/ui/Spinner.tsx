interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = 'Cargando…' }: SpinnerProps) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
