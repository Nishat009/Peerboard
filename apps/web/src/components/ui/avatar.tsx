import { initials } from '@/lib/identity';
import { cx } from '@/lib/cx';

export function Avatar({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string;
  color: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      title={name}
      style={{ backgroundColor: color }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white select-none',
        size === 'sm' ? 'size-7 text-[11px]' : 'size-8 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
