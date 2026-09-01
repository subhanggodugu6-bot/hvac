'use client';

import React from 'react';
import { ActionRecord, SupervisoryCycleResponse } from '@/lib/types';
import { Cpu } from 'lucide-react';

interface AgentDecisionPanelProps {
  data?: SupervisoryCycleResponse;
  actions?: ActionRecord[];
}

export const AgentDecisionPanel: React.FC<AgentDecisionPanelProps> = ({ data, actions }) => {
  const decisionItems =
    actions && actions.length > 0
      ? actions
      : data?.candidate_actions && data.candidate_actions.length > 0
      ? data.candidate_actions
      : [];

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Supervisory Agent Decisions & Control Actions
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Candidate actions from the latest engine cycle
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
          {decisionItems.length} Coordinated Actions
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="bms-table">
          <thead>
            <tr>
              <th>Opp</th>
              <th>Point Target</th>
              <th>Current</th>
              <th>Optimized</th>
              <th>Reason & Engineering Context</th>
              <th>Confidence</th>
              <th>Safety</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {decisionItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-slate-500 py-4">
                  AWAITING TELEMETRY — no candidate actions in the latest cycle.
                </td>
              </tr>
            ) : (
              decisionItems.map((act: any, i: number) => {
                const prevVal = act.previous_value ?? act.current_value;
                const propVal = act.proposed_value;
                const conf = act.confidence;
                const safety = act.safety_result?.status || act.safety_result;
                return (
                  <tr key={act.id || i}>
                    <td>
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded border border-sky-500/30 bg-sky-500/10 text-sky-400">
                        {act.opportunity_code}
                      </span>
                    </td>
                    <td className="text-slate-900 font-semibold">{act.point_id}</td>
                    <td className="text-slate-400">{prevVal == null ? '—' : String(prevVal)}</td>
                    <td className="text-sky-800 font-bold">{propVal == null ? '—' : String(propVal)}</td>
                    <td className="font-sans text-slate-700 text-xs max-w-sm">{act.reason}</td>
                    <td className="text-slate-800 font-semibold">
                      {conf == null ? '—' : `${Math.round(Number(conf) <= 1.5 ? Number(conf) * 100 : Number(conf))}%`}
                    </td>
                    <td>
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        {safety || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-[10px] text-sky-400 font-semibold px-2 py-0.5 rounded border border-sky-500/30 bg-sky-500/10">
                        {act.final_status || 'CANDIDATE'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
