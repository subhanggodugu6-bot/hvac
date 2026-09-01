'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, Settings2 } from 'lucide-react';
import { useSupervisoryStore } from '@/lib/store';
import { AgentMode } from '@/lib/types';
import { DEFAULT_FACILITY_CONFIG } from '@/lib/facilityConfig';
import { hvacFetch, apiJson, API_BASE } from '@/lib/api/client';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';
import type { TelemetryFrame } from '@/lib/hvac/telemetrySocket';
import { fleetOpportunityCards } from '@/lib/hvac/opportunityConfig';

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

type DotTone = 'ok' | 'warn' | 'danger' | 'muted';

function statusDot(tone: DotTone) {
  const map: Record<DotTone, string> = {
    ok: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]',
    warn: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.45)]',
    danger: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.45)]',
    muted: 'bg-slate-400',
  };
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${map[tone]}`} aria-hidden />;
}

function HeaderStatusGroup({
  bmsStatus,
  telemetryLabel,
  ageText,
}: {
  bmsStatus: string;
  telemetryLabel: string;
  ageText: string;
}) {
  const bmsConnected = bmsStatus === 'CONNECTED';
  const telLive = telemetryLabel === 'LIVE';
  const telSim = /SIM/i.test(telemetryLabel);

  const bmsTone: DotTone = bmsConnected ? 'ok' : 'danger';
  const telTone: DotTone = telLive ? 'ok' : telSim ? 'warn' : 'muted';

  const bmsLabel = bmsConnected ? 'BMS live' : 'BMS off';
  const telLabel = telLive ? `Tel ${ageText}` : telSim ? `Sim ${ageText}` : `Tel ${telemetryLabel || '—'}`;

  return (
    <div className="header-status-group" title={`${bmsLabel} · ${telLabel}`}>
      <span className="header-status-item">
        {statusDot(bmsTone)}
        <span>{bmsLabel}</span>
      </span>
      <span className="header-status-divider" aria-hidden />
      <span className="header-status-item">
        {statusDot(telTone)}
        <span>{telLabel}</span>
      </span>
    </div>
  );
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
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!controlsOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) {
        setControlsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setControlsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [controlsOpen]);

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
    return fleetOpportunityCards().filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        (o.shortLabel || '').toLowerCase().includes(q),
    ).slice(0, 6);
  }, [search]);

  const writeLabel = live.controlLabel || 'WRITE DISABLED';

  return (
    <header className="app-header sticky top-0 z-40 select-none" role="banner">
      <span className="sr-only">{writeLabel}</span>
      <div className="app-header-inner">
        {/* Brand */}
        <div className="app-header-brand">
          <div className="min-w-0 hidden sm:block">
            <div className="text-[13px] font-semibold text-slate-900 tracking-tight leading-none">HVAC AI Control</div>
            <div className="text-[11px] text-slate-500 truncate mt-1 max-w-[14rem] lg:max-w-[20rem]">
              <span className="text-slate-700">{buildingName}</span>
              <span className="text-slate-300 mx-1">·</span>
              <span>{buildingLocation || 'Location unavailable'}</span>
            </div>
          </div>
          <div className="sm:hidden text-[13px] font-semibold text-slate-900">HVAC</div>
        </div>

        {/* Center: clock + search */}
        <div className="app-header-center hidden md:flex">
          <div className="header-clock-pill">
            <span className="header-clock-phase">{facilityTime.dayState}</span>
            <span className="header-clock-date truncate">
              {facilityTime.weekday}, {facilityTime.dateStr}
            </span>
            <span className="header-clock-sep" aria-hidden />
            <span className="header-clock-time tabular-nums">{facilityTime.timeStr || '—'}</span>
            <span className="header-clock-weather hidden xl:inline">
              {oat != null ? `${oat.toFixed(1)}°C` : 'OAT —'}
              <span className="mx-1 text-slate-500">·</span>
              {humidity != null ? `RH ${Math.round(humidity)}%` : 'RH —'}
            </span>
          </div>
          <div className="relative flex-1 min-w-0 max-w-md">
            <div className="header-search-pill">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search O1–O20…"
                className="bg-transparent border-0 outline-none w-full min-w-0 text-[12px] text-slate-800 placeholder:text-slate-400"
                aria-label="Search opportunities"
              />
            </div>
            {searchHits.length > 0 ? (
              <div className="header-search-results">
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

        {/* Actions */}
        <div className="app-header-actions">
          <div className="md:hidden">
            <HeaderStatusGroup bmsStatus={bmsStatus} telemetryLabel={telemetryLabel} ageText={ageText} />
          </div>

          <div className="header-segment" role="group" aria-label="Plant data source">
            <button
              type="button"
              onClick={() => setPlant('DATASET')}
              className={`header-segment-btn ${plantMode === 'DATASET' ? 'is-active is-dataset' : ''}`}
            >
              Dataset
            </button>
            <button
              type="button"
              onClick={() => setPlant('LIVE_BMS')}
              className={`header-segment-btn ${plantMode === 'LIVE_BMS' ? 'is-active is-live' : ''}`}
            >
              Live BMS
            </button>
          </div>

          <div className="hidden md:block">
            <HeaderStatusGroup bmsStatus={bmsStatus} telemetryLabel={telemetryLabel} ageText={ageText} />
          </div>

          <button
            type="button"
            className="header-icon-btn"
            onClick={() => router.push('/overview')}
            title="Alerts"
            aria-label={`Alerts${alertCount > 0 ? `, ${alertCount} active` : ''}`}
          >
            <Bell className="w-4 h-4" strokeWidth={2} />
            {alertCount > 0 ? (
              <span className="header-icon-badge">{alertCount > 99 ? '99+' : alertCount}</span>
            ) : null}
          </button>

          <div className="relative" ref={controlsRef}>
            <button
              type="button"
              className="header-controls-btn"
              onClick={() => setControlsOpen((v) => !v)}
              aria-expanded={controlsOpen}
              aria-haspopup="menu"
            >
              <Settings2 className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden lg:inline">Controls</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${controlsOpen ? 'rotate-180' : ''}`} />
            </button>
            {controlsOpen ? (
              <div className="header-controls-menu" role="menu">
                <div className="header-controls-section">
                  <span className="header-controls-label">Operator</span>
                  <span className="header-controls-value">{writeLabel}</span>
                </div>
                <div className="header-controls-section">
                  <span className="header-controls-label">Agent mode</span>
                  <select
                    value={agentMode}
                    onChange={(e) => setAgentMode(e.target.value as AgentMode)}
                    className="header-controls-select"
                    aria-label="Agent mode"
                  >
                    <option value="AUTO">Auto</option>
                    <option value="APPROVAL_REQUIRED">Approval required</option>
                    <option value="ADVISORY">Advisory</option>
                    <option value="SAFE_MODE">Safe mode</option>
                  </select>
                </div>
                <div className="header-controls-row">
                  <button
                    type="button"
                    className="header-controls-link"
                    onClick={() => {
                      router.push('/platform/bms');
                      setControlsOpen(false);
                    }}
                  >
                    Gateway settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      toggleSafe();
                      setControlsOpen(false);
                    }}
                    className={safeMode ? 'header-controls-danger' : 'header-controls-ghost'}
                  >
                    {safeMode ? 'Safe mode on' : 'Safe mode'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="header-user-chip hidden lg:flex">
            <div className="header-user-avatar">OP</div>
            <div className="leading-tight min-w-0">
              <div className="text-[12px] font-semibold text-slate-800 truncate">Operator</div>
              <div className="text-[10px] text-slate-500 truncate">{writeLabel}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
