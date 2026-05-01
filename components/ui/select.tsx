import { forwardRef } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: SelectOption[]
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, id, className = '', ...props }, ref) => {
    const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={[
            'rounded-xl border px-3.5 py-2.5 text-[13.5px] text-ink-1',
            'bg-glass-1 backdrop-blur-xl',
            'transition-all focus:bg-glass-2 focus:outline-none',
            'appearance-none cursor-pointer',
            error
              ? 'border-rose-400/50 focus:border-rose-400'
              : 'border-hairline focus:border-indigo-400/60',
            className,
          ].join(' ')}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-[11.5px] text-rose-300">{error}</p>}
        {hint && !error && <p className="text-[11.5px] text-ink-4">{hint}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
export { Select }
