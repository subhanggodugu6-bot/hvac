'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupervisoryStore } from '@/lib/store';
import { AgentMode } from '@/lib/types';
import { DEFAULT_FACILITY_CONFIG } from '@/lib/facilityConfig';
import { hvacFetch, apiJson, API_BASE } from '@/lib/api/client';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';
import type { TelemetryFrame } from '@/lib/hvac/telemetrySocket';
import { OPPORTUNITIES } from '@/lib/hvac/opportunityConfig';

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatFacilityClock(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const hour24 = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now),
    10,
  );
  let dayState = 'DAY';
  if (hour24 >= 5 && hour24 < 12) dayState = 'MORNING';
  else if (hour24 >= 12 && hour24 < 17) dayState = 'DAY';
  else if (hour24 >= 17 && hour24 < 21) dayState = 'EVENING';
  else dayState = 'NIGHT';
  return {
    weekday: pick('weekday'),
    dateStr: `${pick('day')} ${pick('month')}`,
    timeStr: `${pick('hour')}:${pick('minute')} ${pick('dayPeriod') || ''}`.trim(),
    dayState,
  };
}

export const Header: React.FC = () => {
  const router = useRouter();
  const { agentMode, setAgentMode } = useSupervisoryStore();
  const live = useLiveTelemetry();
  const [buildingName, setBuildingName] = useState<string>(DEFAULT_FACILITY_CONFIG.name);
  const [buildingLocation, setBuildingLocation] = useState<string>(DEFAULT_FACILITY_CONFIG.location);
  const [timezone, setTimezone] = useState<string>(DEFAULT_FACILITY_CONFIG.timezone);
  const [oat, setOat] = useState<number | null>(null);
  const [humidity, setHumidity] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [alertCount, setAlertCount] = useState(0);
  const bmsStatus = live.bmsStatus;
  const telemetryLabel = live.telemetryStatus;
  const telemetryAge = live.telemetryAgeSeconds;
  const safeMode = live.safeMode;
  const plantMode = live.plantMode || 'DATASET';
  const applyFrame = useLiveTelemetry((s) => s.applyFrame);

  const setPlant = async (mode: 'DATASET' | 'LIVE_BMS') => {
    const res = await hvacFetch(`${API_BASE}/platform/plant-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, reason: 'header-toggle' }),
    });
    if (!res.ok) return;
    const status = await res.json();
    applyFrame(
      {
        bms: status.bms,
        telemetry: status.telemetry,
        safeMode: Boolean(status.safeMode),
        plantMode: status.plantMode,
        controlEnabled: Boolean(status.controlEnabled),
        controlLabel: String(status.controlLabel || (status.controlEnabled ? 'WRITE ENABLED' : 'WRITE DISABLED')),
        events: useLiveTelemetry.getState().events,
      },
      useLiveTelemetry.getState().connectionState,
    );
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [body, homeData] = await Promise.all([
          apiJson('/platform/status'),
          apiJson('/platform/dashboard/home').catch(() => null),
        ]);
        if (body && !cancelled) {
          const facility = (body.facility || body.building) as
            | { name?: string; location?: string; timezone?: string }
            | undefined;
          const weather = body.weather as { oat?: unknown; humidity?: unknown; oah?: unknown } | undefined;
          if (facility?.name) setBuildingName(facility.name);
          if (facility?.location) setBuildingLocation(facility.location);
          if (facility?.timezone) setTimezone(facility.timezone);
          const nextOat = num(weather?.oat);
          const nextRh = num(weather?.humidity ?? weather?.oah);
          if (nextOat != null) setOat(nextOat);
          if (nextRh != null) setHumidity(nextRh);
          if (body.plantMode === 'DATASET' || body.plantMode === 'LIVE_BMS') {
            applyFrame(
              {
                bms: (body.bms as TelemetryFrame['bms']) || { status: String(body.bmsStatus || '') },
                telemetry: (body.telemetry as TelemetryFrame['telemetry']) || { status: undefined },
                safeMode: Boolean(body.safeMode),
                plantMode: String(body.plantMode),
                controlEnabled: Boolean(body.controlEnabled),
                controlLabel: String(body.controlLabel || (body.controlEnabled ? 'WRITE ENABLED' : 'WRITE DISABLED')),
                events: useLiveTelemetry.getState().events,
              },
              useLiveTelemetry.getState().connectionState,
            );
          }
        }
        if (homeData && !cancelled) {
          setAlertCount(Number(homeData?.kpis?.alertCount || homeData?.alerts?.length || 0));
        }
      } catch {
        /* keep last known */
      }
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyFrame]);

  const [facilityTime, setFacilityTime] = useState({
    weekday: '',
    dateStr: '',
    timeStr: '',
    dayState: 'DAY',
  });

  useEffect(() => {
    const updateTime = () => {
      try {
        setFacilityTime(formatFacilityClock(timezone, new Date()));
      } catch {
        setFacilityTime(formatFacilityClock('Asia/Kolkata', new Date()));
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  const dayLabel = facilityTime.dayState;

  const toggleSafe = async () => {
    await hvacFetch(`${API_BASE}/platform/safe-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !safeMode, reason: 'header-toggle' }),
    });
  };

  const ageText = telemetryAge != null ? (telemetryAge < 1 ? '<1s' : `${Math.round(telemetryAge)}s`) : '—';

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 1) return [];
    return OPPORTUNITIES.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        (o.shortLabel || '').toLowerCase().includes(q),
    ).slice(0, 6);
  }, [search]);

  return (
    <header className="sticky top-0 z-40 min-h-[4.25rem] py-2 bg-[color:var(--bg-header)] backdrop-blur-xl border-b border-slate-200/70 shadow-[0_1px_0_rgba(255,255,255,0.8)] px-4 lg:px-6 flex items-center select-none">
      <div className="flex flex-wrap items-center justify-between w-full gap-2">
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <div className="min-w-0 hidden sm:block">
            <div className="text-[13px] font-semibold text-slate-900 tracking-tight leading-none">HVAC AI Control</div>
            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-1 max-w-[14rem] lg:max-w-[18rem]">
              <span className="text-slate-700 truncate">{buildingName}</span>
              <span className="text-slate-300">·</span>
              <span className="truncate">{buildingLocation || 'Location unavailable'}</span>
            </div>
          </div>
          <div className="sm:hidden text-[13px] font-semibold text-slate-900">HVAC</div>
        </div>

        <div className="hidden md:flex items-center gap-2 flex-1 min-w-0 max-w-2xl xl:max-w-3xl mx-1">
          <div className="bh-pill bh-pill-dark gap-2 shrink-0 max-w-[40%] xl:max-w-none">
            <span className="text-[10px] font-semibold tracking-wide text-slate-500 shrink-0">{dayLabel}</span>
            <span className="truncate text-[11px]">
              {facilityTime.weekday}, {facilityTime.dateStr}
            </span>
            <span className="text-slate-500">|</span>
            <span className="tabular-nums shrink-0">{facilityTime.timeStr || '—'}</span>
            <span className="text-slate-500 hidden xl:inline">
              · {oat != null ? `${oat.toFixed(1)}°C` : 'OAT —'} · {humidity != null ? `RH ${Math.round(humidity)}%` : 'RH —'}
            </span>
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="bh-pill bh-pill-search w-full gap-2 min-w-0">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search O1–O20…"
                className="bg-transparent border-0 outline-none w-full min-w-0 text-[12px] text-violet-950 placeholder:text-violet-400/70"
                aria-label="Search opportunities"
              />
            </div>
            {searchHits.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-slate-200/90 bg-white/98 backdrop-blur-md shadow-xl overflow-hidden">
                {searchHits.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-[12px] hover:bg-violet-50 flex items-center gap-2"
                    onClick={() => {
                      router.push(o.route);
                      setSearch('');
                    }}
                  >
                    <span className="font-mono text-violet-600">{o.id}</span>
                    <span className="text-slate-700 truncate">{o.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
          <div className="hidden md:flex h-9 rounded-full border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setPlant('DATASET')}
              className={`px-2.5 sm:px-3 text-[10px] font-semibold tracking-wide rounded-full ${
                plantMode === 'DATASET' ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              DATASET
            </button>
            <button
              type="button"
              onClick={() => setPlant('LIVE_BMS')}
              className={`px-2.5 sm:px-3 text-[10px] font-semibold tracking-wide rounded-full ${
                plantMode === 'LIVE_BMS' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              LIVE BMS
            </button>
          </div>
          <div className="hidden xl:flex items-center gap-1.5">
            <StatusBadge tone={bmsStatus === 'CONNECTED' ? 'live' : 'danger'} pulse={false}>
              BMS {bmsStatus}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(telemetryLabel)} pulse={telemetryLabel === 'LIVE'}>
              TEL {telemetryLabel} {ageText}
            </StatusBadge>
          </div>
          <button
            type="button"
            className="relative h-9 px-3 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-violet-300"
            onClick={() => router.push('/overview')}
            title="Alerts"
            aria-label="Alerts"
          >
            Alerts
            {alertCount > 0 ? (
              <span className="ml-1.5 inline-flex min-w-[1rem] h-4 px-1 rounded-full bg-pink-500 text-[9px] font-bold text-white items-center justify-center">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-violet-300"
            onClick={() => router.push('/platform/bms')}
            title="Gateway settings"
            aria-label="Gateway settings"
          >
            Gateway
          </button>
          <select
            value={agentMode}
            onChange={(e) => setAgentMode(e.target.value as AgentMode)}
            className="h-9 rounded-full bg-white border border-slate-200 px-2 text-[11px] font-semibold text-violet-700 focus:outline-none max-w-[7.5rem]"
            aria-label="Agent mode"
          >
            <option value="AUTO">AUTO</option>
            <option value="APPROVAL_REQUIRED">APPROVAL</option>
            <option value="ADVISORY">ADVISORY</option>
            <option value="SAFE_MODE">SAFE MODE</option>
          </select>
          <button type="button" onClick={toggleSafe} className={safeMode ? 'btn-danger' : 'btn-ghost'}>
            {safeMode ? 'SAFE ON' : 'SAFE'}
          </button>
          <div className="hidden lg:flex items-center gap-2 pl-1">
            <div className="w-8 h-8 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">
              OP
            </div>
            <div className="hidden 2xl:block leading-tight">
              <div className="text-[12px] font-semibold text-slate-800">Operator</div>
              <div className="text-[10px] text-slate-500">{live.controlLabel || 'WRITE DISABLED'}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
