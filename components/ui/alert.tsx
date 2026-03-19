type AlertVariant = 'error' | 'success' | 'warning' | 'info'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: React.ReactNode
  className?: string
}

const styles: Record<AlertVariant, string> = {
  error:   'border-red-500/30 bg-red-500/10 text-red-400',
  success: 'border-green-500/30 bg-green-500/10 text-green-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  info:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
}

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      className={[
        'rounded-lg border px-4 py-3 text-sm',
        styles[variant],
        className,
      ].join(' ')}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  )
}
