'use client';

import React from 'react';
import { SupervisoryCycleResponse } from '@/lib/types';
import { useSupervisoryStore } from '@/lib/store';
import { PanelSectionHeader } from '@/components/ui/PanelSectionHeader';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';

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
      status: freshness === 'LIVE' || freshness === 'SIMULATED' ? 'PASS' : freshness ? 'WARNING' : '—',
      value:
        age != null
          ? `${Math.round(age)}s age`
          : freshness === 'SIMULATED'
            ? 'Dataset / simulation feed active'
            : null,
      limit:
        freshness === 'SIMULATED'
          ? 'Simulation mode (no live BMS required)'
          : `< ${dashboard?.thresholds?.liveSeconds ?? 30}s LIVE`,
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
      <PanelSectionHeader
        title="Safety validation guardrails"
        subtitle="Deterministic pre-execution verification gates (fail-safe auto-reversion active)"
        aside={
          <button onClick={() => setIsLimitsModalOpen(true)} className="btn-secondary">
            Configure limits
          </button>
        }
      />

      <div className="overflow-x-auto eng-scroll">
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
            {checks.length === 0 ? (
              <TableEmptyState colSpan={4} title="NO GUARDRAILS" detail="Safety validation checks are not available yet." />
            ) : (
              checks.map((c, i) => (
                <tr key={i}>
                  <td className="font-sans font-medium text-slate-800">{c.name}</td>
                  <td>
                    <span
                      className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                        c.status === 'PASS'
                          ? 'pill-pass'
                          : c.status === 'WARNING'
                            ? 'pill-muted border-amber-300 text-amber-800'
                            : 'pill-fail'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="text-slate-800">{c.value ?? 'AWAITING TELEMETRY'}</td>
                  <td className="text-slate-600">{c.limit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
