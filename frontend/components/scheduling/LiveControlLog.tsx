'use client';

import React from 'react';
import { PanelSectionHeader } from '@/components/ui/PanelSectionHeader';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';

interface LiveControlLogProps {
  activities?: { time?: string; event?: string; detail?: string }[];
}

export const LiveControlLog: React.FC<LiveControlLogProps> = ({ activities }) => {
  const rows = activities && activities.length > 0 ? activities : [];

  return (
    <div className="glass-card overflow-hidden">
      <PanelSectionHeader title="Recent agent activity" subtitle="Persisted O1–O4 events only" />

      <div className="overflow-x-auto eng-scroll">
        <table className="bms-table">
          <thead>
            <tr>
              <th className="w-28">Time</th>
              <th className="w-72">Stage / Event</th>
              <th>Execution Detail & Telemetry Feedback</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {rows.length === 0 ? (
              <TableEmptyState
                colSpan={3}
                title="AWAITING TELEMETRY"
                detail="No persisted activity events yet."
              />
            ) : (
              rows.map((act, i) => (
                <tr key={i}>
                  <td className="text-slate-600 font-semibold">{act.time || '—'}</td>
                  <td className="text-slate-900 font-sans font-medium">{act.event}</td>
                  <td className="text-slate-700 font-sans text-xs">{act.detail}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
