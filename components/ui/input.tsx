import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = '', ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'rounded-xl border px-3.5 py-2.5 text-[13.5px] text-ink-1',
            'bg-glass-1 backdrop-blur-xl',
            'placeholder:text-ink-5 transition-all',
            'focus:bg-glass-2 focus:outline-none',
            error
              ? 'border-rose-400/50 focus:border-rose-400'
              : 'border-hairline focus:border-indigo-400/60',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <p className="text-[11.5px] text-rose-300">{error}</p>}
        {hint && !error && <p className="text-[11.5px] text-ink-4">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export { Input }
