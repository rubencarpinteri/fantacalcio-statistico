interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-hairline backdrop-blur-2xl',
        className,
      ].join(' ')}
      style={{
        background:
          'linear-gradient(180deg, rgba(46,50,88,0.45), rgba(28,30,56,0.55))',
        boxShadow:
          '0 1px 2px rgba(0,0,0,0.35), 0 8px 26px rgba(0,0,0,0.30)',
      }}
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
        'flex items-start justify-between gap-4 border-b border-hairline px-6 py-4',
        className,
      ].join(' ')}
    >
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-ink-1">{title}</h2>
        {description && (
          <p className="mt-1 text-[12px] text-ink-4">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={['px-6 py-4', className].join(' ')}>{children}</div>
}

export function CardFooter({ children, className = '' }: CardProps) {
  return (
    <div
      className={[
        'flex items-center gap-3 border-t border-hairline px-6 py-3',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
