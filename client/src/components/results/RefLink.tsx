const severityColors = {
  high: 'text-danger border-danger',
  medium: 'text-orange border-orange',
  low: 'text-muted border-muted',
  '': 'text-muted border-muted',
} as const;

type SeverityKey = keyof typeof severityColors;

interface RefLinkProps {
  count: number;
  severity: SeverityKey;
  onClick: () => void;
}

export default function RefLink({ count, severity, onClick }: RefLinkProps) {
  if (count === 0) return <span>0</span>;
  const colorClass = severityColors[severity] || severityColors[''];
  return (
    <span
      className={`cursor-pointer border-b border-dotted hover:text-cyan ${colorClass}`}
      onClick={onClick}
    >
      {count}
    </span>
  );
}
