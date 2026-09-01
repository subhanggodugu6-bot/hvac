'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { secondsAgo } from '@/lib/hvac/o15Format';

function agentLabel(data: O15Dashboard | null | undefined, prov: string): string {
  if (!data) return 'OFFLINE';
  if (prov === 'SIMULATED' || prov === 'BMS OFFLINE' || prov === 'NO DATA') return 'OFFLINE';
  const ui = (data.ui_state || data.header?.ui_state || '').toUpperCase();
  if (ui === 'NO_DATA') return 'OFFLINE';
  if (data.agent_status) return String(data.agent_status).toUpperCase();
  if ((data.header?.optimization || '').toUpperCase() === 'ACTIVE' && prov === 'LIVE') return 'ACTIVE';
  if (ui === 'DEGRADED' || ui === 'STALE' || prov === 'STALE') return 'DEGRADED';
  return prov === 'LIVE' ? 'ACTIVE' : 'DEGRADED';
}

function modeLabel(data: O15Dashboard | null | undefined): string {
  if (!data) return 'NO DATA';
  if (data.safe_mode || data.header?.safe_mode) return 'SAFE_MODE';
  return (data.header?.control_mode || data.config?.control_mode || 'ADVISORY').toUpperCase();
}

function safetyLabel(data: O15Dashboard | null | undefined): string {
  if (!data) return 'NO DATA';
  const s = (data.header?.safety || data.safety_status || '').toUpperCase();
  if (s === 'PASS') return 'PASS';
  if (s === 'REJECT' || s === 'BLOCKED') return 'BLOCK';
  if (s === 'HOLD') return 'HOLD';
  if (s) return s;
  return 'NO DATA';
}

export function O15Header({ data }: { data?: O15Dashboard | null }) {
  const def = getOpportunity('O15')!;
  const prov = data ? provenanceFromAgent(data as unknown as Record<string, unknown>) : 'NO DATA';
  const bms = data?.bms_connected ? 'CONNECTED' : 'OFFLINE';
  const agent = agentLabel(data, prov);
  return (
    <header className="px-5 pt-5 pb-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mt-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700 mb-1.5">O15</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{def.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O15 operating status">
          <StatusBadge tone={toneForStatus(bms)}>{`BMS ${bms}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(prov)}>{`Telemetry ${prov}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(agent)}>{`Agent ${agent}`}</StatusBadge>
          <StatusBadge tone="neutral">{`Mode ${modeLabel(data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(safetyLabel(data))}>{`Safety ${safetyLabel(data)}`}</StatusBadge>
          <StatusBadge tone="muted" pulse={false}>
            Last update {secondsAgo(data?.header?.last_telemetry || data?.evaluated_at)}
          </StatusBadge>
        </div>
        </div>
      </div>
    </header>
  );
}

export function O15StatusStrip({ data }: { data: O15Dashboard }) {
  const prov = provenanceFromAgent(data as unknown as Record<string, unknown>);
  const banners: Array<{ title: string; detail: string }> = [];
  if (prov === 'SIMULATED') {
    banners.push({ title: 'SIMULATION DATA', detail: 'BMS WRITE DISABLED. Simulation is never LIVE.' });
  }
  if (prov === 'STALE') {
    banners.push({ title: 'STALE TELEMETRY', detail: 'OPTIMIZATION HELD' });
  }
  if (!data.bms_connected || prov === 'BMS OFFLINE') {
    banners.push({ title: 'BMS OFFLINE', detail: 'DISPATCH UNAVAILABLE' });
  }
  if ((data.safety_status || '').toUpperCase() === 'REJECT') {
    banners.push({ title: 'SAFETY BLOCK', detail: 'DISPATCH DISABLED' });
  }
  if (!banners.length) return null;
  return (
    <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
      {banners.map((b) => (
        <div key={b.title} className="kpi-tile min-h-0 border-amber-500/30" role="status">
          <div className="text-[11px] font-semibold tracking-wider text-amber-300">{b.title}</div>
          <div className="text-[11px] text-slate-600 mt-1">{b.detail}</div>
        </div>
      ))}
    </div>
  );
}
