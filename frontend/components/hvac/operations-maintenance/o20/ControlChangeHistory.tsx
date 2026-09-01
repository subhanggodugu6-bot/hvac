'use client';

import { useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge } from '@/components/hvac/StatusBadge';
import { useO20Mutations } from '@/hooks/useO20';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { formatDash } from '@/lib/hvac/formatters';
import { o20CanSubmitChange, o20ErrorMessage, o20SecondsAgo, o20WriteBlock } from '@/lib/hvac/o20Format';

export function ControlChangeHistory({
  data,
  dash,
  platform,
}: {
  data: OmOpportunity;
  dash?: OmDashboardData;
  platform?: PlatformGate | null;
}) {
  const { changeRequest } = useO20Mutations();
  const allowed = o20CanSubmitChange(data, dash, platform);
  const block = o20WriteBlock(data, dash, platform);
  const [point, setPoint] = useState('');
  const [oldValue, setOldValue] = useState('');
  const [proposed, setProposed] = useState('');
  const [reason, setReason] = useState('');
  const events = (data.audit || []).filter((e) => (e.event_type || '').toUpperCase().includes('CHANGE'));

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Change management">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Software control change workflow</h2>
      <p className="text-[11px] text-amber-800">Automatic software deployment is prohibited. Change requests enter REVIEW_REQUIRED supervisory process only.</p>
      <p className="text-[11px] font-mono text-slate-400">{block}</p>
      <form
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!allowed) return;
          changeRequest.mutate({
            point: point || null,
            old_value: oldValue || null,
            proposed_value: proposed || null,
            reason: reason || data.recommendation?.rationale || 'Governed control-software change request',
            status: 'REVIEW_REQUIRED',
          });
        }}
      >
        <label className="text-[11px] text-slate-500">
          Point
          <input className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400" value={point} onChange={(e) => setPoint(e.target.value)} />
        </label>
        <label className="text-[11px] text-slate-500">
          Old value
          <input className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400" value={oldValue} onChange={(e) => setOldValue(e.target.value)} />
        </label>
        <label className="text-[11px] text-slate-500">
          Proposed value
          <input className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400" value={proposed} onChange={(e) => setProposed(e.target.value)} />
        </label>
        <label className="text-[11px] text-slate-500 md:col-span-2 xl:col-span-1">
          Reason
          <input className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-40" disabled={!allowed || changeRequest.isPending}>
            Submit change request
          </button>
        </div>
      </form>
      {changeRequest.isError ? (
        <p className="text-[11px] text-rose-800" role="alert">{o20ErrorMessage(changeRequest.error)}</p>
      ) : null}
      {events.length === 0 ? (
        <EmptyState title="NO DATA AVAILABLE" detail="No CHANGE_REQUEST audit rows have been returned yet." />
      ) : (
        <EngineeringTable>
          <thead>
            <tr>
              <th>Change ID</th>
              <th>Point</th>
              <th>Old Value</th>
              <th>Proposed Value</th>
              <th>Reason</th>
              <th>Requested By</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={`${e.timestamp}-${i}`}>
                <td className="font-mono">{formatDash(e.event_type)}</td>
                <td className="font-mono">—</td>
                <td className="font-mono">—</td>
                <td className="font-mono">—</td>
                <td>{formatDash(e.message)}</td>
                <td className="font-mono">{formatDash(e.actor)}</td>
                <td>
                  <StatusBadge tone="warn">REVIEW_REQUIRED</StatusBadge>
                </td>
                <td className="font-mono">{o20SecondsAgo(e.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </EngineeringTable>
      )}
    </section>
  );
}
