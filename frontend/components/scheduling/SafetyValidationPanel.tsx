'use client';

import React from 'react';
import { SupervisoryCycleResponse } from '@/lib/types';
import { useSupervisoryStore } from '@/lib/store';
import { ShieldCheck, Sliders } from 'lucide-react';

interface SafetyValidationPanelProps {
  data?: SupervisoryCycleResponse;
  dashboard?: any;
}

export const SafetyValidationPanel: React.FC<SafetyValidationPanelProps> = ({ data, dashboard }) => {
  const { setIsLimitsModalOpen } = useSupervisoryStore();
  const isDataValid = dashboard?.dataQualityValid ?? data?.data_quality_valid;
  const criticalAlarmsCount = data?.sensor_faults?.length ?? 0;
  const age = dashboard?.telemetryHeartbeat;
  const freshness = dashboard?.telemetryFreshness;

  const checks = [
    {
      name: 'Telemetry Freshness',
      status: freshness === 'LIVE' ? 'PASS' : freshness ? 'WARNING' : '—',
      value: age != null ? `${Math.round(age)}s age` : null,
      limit: `< ${dashboard?.thresholds?.liveSeconds ?? 30}s LIVE`,
    },
    {
      name: 'Sensor Quality Verification',
      status: isDataValid == null ? '—' : isDataValid ? 'PASS' : 'FAIL',
      value: isDataValid == null ? null : isDataValid ? 'Cycle data_quality_valid' : 'Quality gate failed',
      limit: 'data_quality_valid = true',
    },
    {
      name: 'Critical Alarms Check',
      status: criticalAlarmsCount === 0 ? 'PASS' : 'FAIL',
      value: `${criticalAlarmsCount} Active Alarms`,
      limit: '0 Alarms required',
    },
    {
      name: 'O1–O4 Guardrails',
      status: dashboard?.safetyGuardrails || '—',
      value: dashboard?.safetyFailCount != null ? `${dashboard.safetyFailCount} failures` : null,
      limit: 'Persisted o1_safety_validation',
    },
  ];

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Safety Validation Guardrails
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Deterministic pre-execution verification gates (Fail-safe auto-reversion active)
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsLimitsModalOpen(true)}
          className="btn-secondary"
        >
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>Configure Limits</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="bms-table">
          <thead>
            <tr>
              <th>Validation Check</th>
              <th>Status</th>
              <th>Current Telemetry</th>
              <th>Configured Engineering Limit</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {checks.map((c, i) => (
              <tr key={i}>
                <td className="font-sans font-medium text-slate-800">{c.name}</td>
                <td>
                  <span
                    className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                      c.status === 'PASS'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : c.status === 'WARNING'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="text-slate-800">{c.value ?? 'AWAITING TELEMETRY'}</td>
                <td className="text-slate-400">{c.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
