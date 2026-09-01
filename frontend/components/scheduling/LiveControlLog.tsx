'use client';

import React from 'react';
import { Activity, Clock } from 'lucide-react';

interface LiveControlLogProps {
  activities?: { time?: string; event?: string; detail?: string }[];
}

export const LiveControlLog: React.FC<LiveControlLogProps> = ({ activities }) => {
  const rows = activities && activities.length > 0 ? activities : [];

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-700">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Recent Agent Activity & Control Log
            </h3>
            <p className="text-xs text-slate-600 font-sans mt-0.5">
              Persisted O1–O4 events only
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
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
              <tr>
                <td colSpan={3} className="text-slate-500 py-4">
                  AWAITING TELEMETRY — no persisted activity events yet.
                </td>
              </tr>
            ) : (
              rows.map((act, i) => (
                <tr key={i}>
                  <td className="text-slate-400 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{act.time || '—'}</span>
                    </span>
                  </td>
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
