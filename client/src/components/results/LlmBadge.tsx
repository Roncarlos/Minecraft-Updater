const severityStyles = {
  safe: 'bg-success-bg text-success border-success',
  caution: 'bg-warning-bg text-warning border-warning',
  breaking: 'bg-danger-bg text-danger border-danger',
} as const;

interface LlmBadgeProps {
  severity: 'safe' | 'caution' | 'breaking';
  onClick: () => void;
}

export default function LlmBadge({ severity, onClick }: LlmBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[0.7rem] font-bold uppercase tracking-wide cursor-pointer mr-1 border ${severityStyles[severity]}`}
      onClick={onClick}
    >
      {severity.toUpperCase()}
    </span>
  );
}
