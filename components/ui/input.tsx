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
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9095b8]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'rounded-xl border px-3.5 py-2.5 text-[13.5px] text-[#f5f7ff]',
            'bg-white/[0.04] backdrop-blur-xl',
            'placeholder:text-[#6a6f8e] transition-all',
            'focus:bg-white/[0.07] focus:outline-none',
            error
              ? 'border-rose-400/50 focus:border-rose-400'
              : 'border-white/10 focus:border-indigo-400/60',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <p className="text-[11.5px] text-rose-300">{error}</p>}
        {hint && !error && <p className="text-[11.5px] text-[#9095b8]">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export { Input }
