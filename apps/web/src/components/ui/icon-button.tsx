import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only buttons need an accessible name. Also shown as a native tooltip. */
  label: string;
  /** Toggle state. Leave undefined for plain action buttons (no aria-pressed). */
  active?: boolean;
  size?: 'sm' | 'md';
};

export function IconButton({ label, active, size = 'md', className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'size-7' : 'size-9',
        active
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
      {...props}
    />
  );
}
