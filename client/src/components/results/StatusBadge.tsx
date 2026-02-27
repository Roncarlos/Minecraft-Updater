const badgeStyles = {
  downloaded: 'bg-info-bg text-info',
  applied: 'bg-success-bg text-success',
  error: 'bg-danger-bg text-danger',
  downloading: 'bg-warning-bg text-warning',
  'rolled-back': 'bg-warning-bg text-warning',
} as const;

interface StatusBadgeProps {
  status: keyof typeof badgeStyles;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[0.75rem] font-semibold ${badgeStyles[status]}`}>
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
