import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type SegmentOption<T extends string> = { value: T; label: string; icon?: ReactNode };

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // The visible label is hidden on small screens; keep the accessible name.
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
              selected
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {option.icon}
            <span className={option.icon ? 'hidden sm:inline' : undefined}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
