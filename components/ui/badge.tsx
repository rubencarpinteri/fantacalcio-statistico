type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default:  'border border-[#2e2e42] bg-[#252532] text-[#f0f0fa]',
  success:  'border border-green-500/30 bg-green-500/10 text-green-400',
  warning:  'border border-amber-500/30 bg-amber-500/10 text-amber-400',
  danger:   'border border-red-500/30 bg-red-500/10 text-red-400',
  info:     'border border-blue-500/30 bg-blue-500/10 text-blue-400',
  accent:   'border border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
  muted:    'border border-transparent bg-[#1a1a24] text-[#8888aa]',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

// Convenience: matchday status → badge variant
export function MatchdayStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    draft: 'muted',
    open: 'info',
    closed: 'success',
    archived: 'muted',
    // Legacy statuses
    locked: 'warning',
    scoring: 'accent',
    published: 'success',
  }
  const labels: Record<string, string> = {
    draft: 'Bozza',
    open: 'Aperta',
    closed: 'Chiusa',
    archived: 'Archiviata',
    // Legacy statuses
    locked: 'Chiusa (legacy)',
    scoring: 'In calcolo (legacy)',
    published: 'Pubblicata (legacy)',
  }
  return (
    <Badge variant={map[status] ?? 'muted'}>
      {labels[status] ?? status}
    </Badge>
  )
}
