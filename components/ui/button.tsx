import { forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 text-white ' +
    'shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] ' +
    'hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-55',
  secondary:
    'border border-hairline bg-glass-2 text-ink-2 backdrop-blur-xl ' +
    'shadow-[0_1px_2px_rgba(0,0,0,0.25)] hover:bg-glass-3 hover:border-hairline-strong disabled:opacity-55',
  ghost:
    'border border-transparent text-ink-3 hover:text-ink-1 hover:bg-glass-1 disabled:opacity-55',
  danger:
    'border border-rose-400/30 bg-rose-500/10 text-rose-300 backdrop-blur-xl ' +
    'hover:bg-rose-500/20 hover:border-rose-400/50 disabled:opacity-55',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] rounded-lg',
  md: 'px-3.5 py-2 text-[13px] rounded-xl',
  lg: 'px-5 py-2.5 text-[14px] rounded-xl',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center gap-2 font-medium tracking-tight',
          'transition-all duration-150 cursor-pointer',
          'disabled:cursor-not-allowed',
          'active:translate-y-px',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
