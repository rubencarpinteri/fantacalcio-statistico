interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={[
        'rounded-xl border border-[#2e2e42] bg-[#111118]',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className = '' }: CardHeaderProps) {
  return (
    <div
      className={[
        'flex items-start justify-between gap-4 border-b border-[#2e2e42] px-6 py-4',
        className,
      ].join(' ')}
    >
      <div>
        <h2 className="text-sm font-semibold text-[#f0f0fa]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-[#8888aa]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardContent({ children, className = '' }: CardProps) {
  return (
    <div className={['px-6 py-4', className].join(' ')}>{children}</div>
  )
}

export function CardFooter({ children, className = '' }: CardProps) {
  return (
    <div
      className={[
        'border-t border-[#2e2e42] px-6 py-3 flex items-center gap-3',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
