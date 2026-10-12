import { cx } from '@/lib/cx';

export function Divider({
  vertical = false,
  className,
}: {
  vertical?: boolean;
  className?: string;
}) {
  return (
    <span
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cx('shrink-0 bg-slate-200', vertical ? 'mx-1 h-5 w-px' : 'h-px w-full', className)}
    />
  );
}
