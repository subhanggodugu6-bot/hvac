'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HUB_RAIL, type DashboardChapter } from '@/lib/hvac/dashboardHome';

function countPill(label: string, value: number, tone: 'live' | 'sim' | 'await') {
  const styles =
    tone === 'live'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : tone === 'sim'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${styles}`}>
      {value} {label}
    </span>
  );
}

export function AgentsChapterGrid({ chapters }: { chapters: DashboardChapter[] }) {
  if (!chapters.length) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {chapters.map((ch) => {
        const color = HUB_RAIL[ch.id] || 'var(--accent-purple)';
        return (
          <Link
            key={ch.id}
            href={ch.href}
            className="group card-interactive overflow-hidden flex flex-col min-h-[9.5rem]"
          >
            <div className="h-1 w-full shrink-0" style={{ background: color }} />
            <div className="p-4 flex flex-col flex-1 gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] font-bold text-slate-900 tracking-tight leading-snug group-hover:text-violet-800">
                  {ch.title}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-600 shrink-0 mt-0.5" />
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{ch.section}</p>
              <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                {countPill('LIVE', ch.counts.live, 'live')}
                {countPill('SIM', ch.counts.simulated, 'sim')}
                {countPill('AWAIT', ch.counts.awaiting, 'await')}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {ch.opportunities.slice(0, 5).map((o) => (
                  <span
                    key={o.id}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-slate-600"
                  >
                    {o.id}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
