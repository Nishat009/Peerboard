import type { ReactNode } from 'react';

/** Centered state screen for loading, errors and empty states. */
export function FullPageMessage({
  icon,
  title,
  children,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {icon && (
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-white text-slate-600 shadow-xs ring-1 ring-slate-200">
            {icon}
          </div>
        )}
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {children && <div className="mt-2 text-sm text-slate-600">{children}</div>}
        {actions && <div className="mt-6 flex justify-center gap-3">{actions}</div>}
      </div>
    </main>
  );
}
