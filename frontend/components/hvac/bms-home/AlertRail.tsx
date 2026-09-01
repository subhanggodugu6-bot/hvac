'use client';

import React from 'react';
import Link from 'next/link';
import { mappingHref, type DashboardAlert } from '@/lib/hvac/dashboardHome';

function ageLabel(age?: number | null) {
  if (age == null) return '';
  if (age < 60) return `${Math.round(age)}s`;
  if (age < 3600) return `${Math.round(age / 60)}m`;
  return `${Math.round(age / 3600)}h`;
}

function severityStyle(sev: string) {
  const s = sev.toUpperCase();
  if (s === 'BAD' || s === 'CRITICAL' || s === 'BMS') return { bar: 'bg-pink-500', tag: 'bg-pink-50 text-pink-700 border-pink-200', label: s === 'BMS' ? 'BMS' : 'Critical' };
  if (s === 'STALE' || s === 'MAINTENANCE' || s === 'HIGH') return { bar: 'bg-amber-500', tag: 'bg-amber-50 text-amber-800 border-amber-200', label: s === 'MAINTENANCE' ? 'Maint' : 'High' };
  return { bar: 'bg-blue-500', tag: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Medium' };
}

export function AlertRail({ alerts, compact }: { alerts?: DashboardAlert[]; compact?: boolean }) {
  const rows = alerts || [];

  if (compact) {
    return (
      <section className="card-static px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Alert Feed</div>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums">{rows.length}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-[11px] text-slate-500 truncate">No stale, bad, BMS, or maintenance alerts.</p>
          ) : (
            <ul className="flex items-center gap-2 overflow-x-auto eng-scroll min-w-0 flex-1 py-0.5">
              {rows.slice(0, 8).map((a, i) => {
                const style = severityStyle(a.severity);
                const href = a.equipment_id
                  ? mappingHref(a.equipment_id, a.point_id?.includes('.') ? a.point_id.split('.').slice(1).join('.') : undefined)
                  : '/platform/bms';
                const title = a.point_id || a.equipment_id || a.message;
                return (
                  <li key={`${a.severity}-${a.point_id || a.equipment_id || i}`} className="shrink-0">
                    <Link
                      href={href}
                      className="inline-flex items-center gap-1.5 max-w-[220px] rounded-full border border-slate-200 bg-white px-2.5 py-1 hover:border-violet-300 hover:bg-violet-50/50 transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.bar}`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-full border ${style.tag}`}>
                        {style.label}
                      </span>
                      <span className="text-[11px] font-medium text-slate-800 truncate">{title}</span>
                      {a.age_seconds != null ? (
                        <span className="text-[9px] text-slate-500 shrink-0">{ageLabel(a.age_seconds)}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
              {rows.length > 8 ? (
                <li className="shrink-0 text-[10px] text-slate-500 font-mono">+{rows.length - 8} more</li>
              ) : null}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="card-static p-4 space-y-3 h-full">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-slate-800">Alert Feed</div>
        <span className="text-[11px] font-semibold text-slate-600">{rows.length}</span>
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
                  <span className="text-[10px] text-slate-600 shrink-0">{ageLabel(a.age_seconds)}</span>
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
