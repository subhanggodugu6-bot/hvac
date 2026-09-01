'use client';

export function O15Skeleton({ label }: { label: string }) {
  return (
    <div className="kpi-tile min-h-[120px]" aria-busy="true" aria-label={`${label} loading`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-3 h-5 w-2/3 bg-slate-200 animate-pulse rounded" />
      <div className="mt-2 h-3 w-1/2 bg-slate-800/50 animate-pulse rounded" />
    </div>
  );
}

export function O15SectionSkeleton({ title, rows = 4 }: { title: string; rows?: number }) {
  return (
    <div className="kpi-tile" aria-busy="true" aria-label={`${title} loading`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">{title}</div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-800/70 animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}
