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
            className="text-xs font-medium uppercase tracking-wider text-[#8888aa]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'rounded-lg border bg-[#1a1a24] px-3 py-2 text-sm text-white',
            'placeholder-[#55556a] transition-colors',
            'focus:border-indigo-500 focus:outline-none',
            error
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-[#2e2e42]',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-[#55556a]">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export { Input }
