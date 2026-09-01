'use client';

import { useMemo, useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import {
  o18Bucket,
  o18Completions,
  o18Programs,
  o18SecondsAgo,
  type TrainingBucket,
} from '@/lib/hvac/o18Format';

type Filter = 'All' | TrainingBucket;

export function TrainingTable({ data }: { data: OmOpportunity }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [sortKey, setSortKey] = useState<'item' | 'audience' | 'purpose' | 'status' | 'completion'>('item');
  const [asc, setAsc] = useState(true);
  const programs = o18Programs(data);
  const updated = o18SecondsAgo(data.telemetry?.lastUpdated || data.timestamp);

  const rows = useMemo(() => {
    if (!programs) return [];
    const completions = o18Completions(data) || [];
    return programs.map((p) => {
      const matches = completions.filter((c) => c.programId && p.id && c.programId === p.id);
      const audience = matches.map((c) => c.roleLabel).filter(Boolean).join(', ') || '—';
      const completion = matches.find((c) => c.completionPct != null)?.completionPct ?? null;
      const bucket = o18Bucket(p.status);
      return {
        item: p.programName || p.topic || p.id || '—',
        audience,
        purpose: p.topic || '—',
        status: bucket || formatDash(p.status),
        completion: formatPercent(completion),
        relevance: p.required == null ? '—' : p.required ? 'REQUIRED' : 'OPTIONAL',
        updated,
        bucket,
      };
    });
  }, [data, programs, updated]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter !== 'All' && r.bucket !== filter) return false;
      if (!needle) return true;
      return `${r.item} ${r.audience} ${r.purpose} ${r.status}`.toLowerCase().includes(needle);
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [asc, filter, q, rows, sortKey]);

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Training table">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Training activity</h2>
      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <label className="text-[11px] text-slate-500 flex-1">
          Search
          <input
            className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search training items"
          />
        </label>
        <div className="flex gap-1" role="group" aria-label="Status filter">
          {(['All', 'Pending', 'In Progress', 'Completed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={`px-2 py-1.5 text-[11px] font-mono border focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                filter === f ? 'border-cyan-500/40 text-cyan-800' : 'border-slate-200 text-slate-600'
              }`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <EngineeringTable>
        <thead>
          <tr>
            {(
              [
                ['item', 'Training Item'],
                ['audience', 'Audience'],
                ['purpose', 'Purpose'],
                ['status', 'Status'],
                ['completion', 'Completion'],
              ] as const
            ).map(([key, label]) => (
              <th key={key}>
                <button
                  type="button"
                  className="font-semibold focus-visible:ring-2 focus-visible:ring-cyan-400"
                  onClick={() => {
                    if (sortKey === key) setAsc((v) => !v);
                    else {
                      setSortKey(key);
                      setAsc(true);
                    }
                  }}
                >
                  {label}
                  {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
            <th>Energy Relevance</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {!programs ? (
            <TableEmptyState colSpan={7} detail="Training program list was not returned by the API." />
          ) : visible.length === 0 ? (
            <TableEmptyState colSpan={7} detail="No training programs match the selected filter." />
          ) : (
            visible.map((r) => (
              <tr key={r.item}>
                <td>{r.item}</td>
                <td className="font-mono">{r.audience}</td>
                <td>{r.purpose}</td>
                <td>
                  <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
                </td>
                <td className="font-mono">{r.completion}</td>
                <td className="font-mono">{r.relevance}</td>
                <td className="font-mono">{r.updated}</td>
              </tr>
            ))
          )}
        </tbody>
      </EngineeringTable>
    </section>
  );
}
