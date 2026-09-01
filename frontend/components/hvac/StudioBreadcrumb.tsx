'use client';

import Link from 'next/link';
import type { OpportunityDef } from '@/lib/hvac/opportunityConfig';

export function StudioBreadcrumb({ def }: { def: OpportunityDef }) {
  return (
    <nav className="text-[11px] text-slate-500 tracking-wide" aria-label="Breadcrumb">
      <Link href="/overview" className="hover:text-violet-600">
        Dashboard
      </Link>
      <span className="text-slate-700"> / </span>
      <Link href={def.sectionHref} className="hover:text-violet-600">
        {def.sectionTitle}
      </Link>
      <span className="text-slate-700"> / </span>
      <span className="text-violet-600 font-semibold">
        {def.id} {def.shortLabel}
      </span>
    </nav>
  );
}
