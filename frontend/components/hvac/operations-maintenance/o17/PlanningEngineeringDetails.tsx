'use client';

import type { ReactNode } from 'react';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import {
  O17_GUIDE_DESCRIPTION,
  o17BaselineKw,
  o17CurrentKw,
  o17ImpactKw,
  o17Kw,
  o17TargetKw,
} from '@/lib/hvac/o17Format';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="border border-slate-200 px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400">
        {title}
      </summary>
      <div className="mt-2 text-[12px] text-slate-600 leading-relaxed">{children}</div>
    </details>
  );
}

export function PlanningEngineeringDetails({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  return (
    <section id="o17-engineering" className="col-span-12 kpi-tile space-y-2" aria-label="Engineering details">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Engineering details</h2>
      <Block title="Planning Objective">
        {data.description || O17_GUIDE_DESCRIPTION} Identify inefficient operating periods, energy targets, baseline
        deviations, and optimization opportunities for the facility energy management plan.
      </Block>
      <Block title="Current Energy State">{o17Kw(o17CurrentKw(data, dash))} actual HVAC/electrical demand from telemetry.</Block>
      <Block title="Baseline">{o17Kw(o17BaselineKw(data, dash))} planning baseline supplied by the O17 evaluator.</Block>
      <Block title="Target">{o17Kw(o17TargetKw(data, dash))} energy target used for deviation and opportunity ranking.</Block>
      <Block title="Energy Impact">
        {o17Kw(o17ImpactKw(data, dash))} estimated kW opportunity from current versus target/baseline. Guide-wide potential
        of up to 50% total energy reduction is an industry planning figure, not a verified site result.
      </Block>
      <Block title="Constraints">
        {formatDash(data.dispatch?.blockReason || data.dispatch?.status)}. Safety {formatDash(data.safety?.status)}. Guardrail{' '}
        {data.safety?.passed == null ? '—' : data.safety.passed ? 'PASS' : 'FAIL'}.
      </Block>
      <Block title="Data Sources">
        Telemetry source {formatDash(data.telemetry?.source || data.source)}. Opportunity API GET
        /api/hvac/operations-maintenance/O17.
      </Block>
      <Block title="Calculation Method">
        Supervisory comparison of current HVAC/electrical kW against optional baseline and target. Occupancy and outdoor
        temperature are supporting context when present. Time-series historian values are not calculated on this page.
      </Block>
      <Block title="Recommendation Logic">
        Engine actions such as TRIM_UNOCCUPIED_LOAD, MAINTAIN_PLAN, or HOLD map to supervisory decisions OPTIMIZE,
        REVIEW_REQUIRED, WAIT_FOR_TELEMETRY, SAFE_HOLD, or BLOCKED. Stale telemetry forces SAFE_HOLD. Missing telemetry
        forces WAIT_FOR_TELEMETRY.
      </Block>
    </section>
  );
}
