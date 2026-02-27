const variantClasses = {
  primary: 'bg-gradient-to-br from-info to-success text-white',
  download: 'bg-info-bg text-info border border-info',
  apply: 'bg-success-bg text-success border border-success',
  rollback: 'bg-warning-bg text-warning border border-warning',
  cancel: 'bg-surface text-muted border border-border',
  confirm: 'bg-success-bg text-success border border-success',
  settings: 'bg-surface text-muted border border-border hover:text-text hover:border-muted',
} as const;

const sizeClasses = {
  sm: 'px-3 py-1 text-[0.8rem]',
  md: 'px-5 py-2 text-[0.9rem]',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export default function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-md font-semibold cursor-pointer transition-opacity hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
