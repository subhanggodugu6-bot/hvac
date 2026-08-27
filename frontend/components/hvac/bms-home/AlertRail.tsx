'use client';

import React from 'react';
import Link from 'next/link';
import { mappingHref, type DashboardAlert } from '@/lib/hvac/dashboardHome';

function ageLabel(age?: number | null) {
  if (age == null) return '';
  if (age < 60) return `${Math.round(age)}s ago`;
  if (age < 3600) return `${Math.round(age / 60)}m ago`;
  return `${Math.round(age / 3600)}h ago`;
}

function severityStyle(sev: string) {
  const s = sev.toUpperCase();
  if (s === 'BAD' || s === 'CRITICAL' || s === 'BMS') return { bar: 'bg-pink-500', tag: 'bg-pink-50 text-pink-700 border-pink-200', label: s === 'BMS' ? 'BMS' : 'Critical' };
  if (s === 'STALE' || s === 'MAINTENANCE' || s === 'HIGH') return { bar: 'bg-amber-500', tag: 'bg-amber-50 text-amber-800 border-amber-200', label: s === 'MAINTENANCE' ? 'Maint' : 'High' };
  return { bar: 'bg-blue-500', tag: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Medium' };
}

export function AlertRail({ alerts }: { alerts?: DashboardAlert[] }) {
  const rows = alerts || [];
  return (
    <section className="card-static p-4 space-y-3 h-full">
        <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-slate-800">Alert Feed</div>
        <span className="text-[11px] font-semibold text-slate-400">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-slate-500">No stale, bad, BMS, or maintenance alerts.</p>
      ) : (
        <ul className="space-y-2.5 max-h-[28rem] overflow-y-auto">
          {rows.map((a, i) => {
            const style = severityStyle(a.severity);
            const href = a.equipment_id
              ? mappingHref(a.equipment_id, a.point_id?.includes('.') ? a.point_id.split('.').slice(1).join('.') : undefined)
              : '/platform/bms';
            return (
              <li
                key={`${a.severity}-${a.point_id || a.equipment_id || i}`}
                className="relative rounded-2xl border border-slate-100 bg-white p-3 pl-3.5 overflow-hidden"
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} />
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${style.tag}`}>
                    {style.label}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">{ageLabel(a.age_seconds)}</span>
                </div>
                <div className="mt-1.5 text-[12px] font-semibold text-slate-800 leading-snug">
                  {a.point_id || a.equipment_id || a.message}
                </div>
                {a.message && a.point_id ? <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{a.message}</p> : null}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Link href={href} className="btn-primary text-[10px] py-1.5 px-3">
                    Map point
                  </Link>
                  <Link href="/platform/bms?tab=status" className="btn-ghost text-[10px] py-1.5 px-3">
                    Gateway
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
