'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { opportunitiesForSection } from '@/lib/hvac/opportunityConfig';
import { StatusBadge } from '@/components/hvac/StatusBadge';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resetMode = (searchParams.get('mode') || '').toUpperCase();

  const isSchedulingActive = pathname.startsWith('/agents/scheduling');
  const isPlantControlActive = pathname.startsWith('/agents/plant-control');
  const isVentilationActive = pathname.startsWith('/agents/ventilation-airflow');
  const isVariableSpeedActive = pathname.startsWith('/agents/variable-speed');
  const isOmActive = pathname.startsWith('/agents/operations-maintenance');

  const [open, setOpen] = useState({
    scheduling: isSchedulingActive,
    plant: isPlantControlActive,
    vent: isVentilationActive,
    vs: isVariableSpeedActive,
    om: isOmActive,
  });

  useEffect(() => {
    setOpen((prev) => ({
      scheduling: isSchedulingActive ? true : prev.scheduling,
      plant: isPlantControlActive ? true : prev.plant,
      vent: isVentilationActive ? true : prev.vent,
      vs: isVariableSpeedActive ? true : prev.vs,
      om: isOmActive ? true : prev.om,
    }));
  }, [isSchedulingActive, isPlantControlActive, isVentilationActive, isVariableSpeedActive, isOmActive]);

  const live = useLiveTelemetry();
  const bmsStatus = live.bmsStatus;
  const telemetryLabel = live.telemetryStatus;

  const isActive = (path: string) => pathname === path;
  const onTempReset = pathname.startsWith('/agents/plant-control/temperature-reset');

  let effectiveReset: 'HHW' | 'CHW' | 'CW' | null = null;
  if (onTempReset && resetMode === 'HHW') effectiveReset = 'HHW';
  else if (onTempReset && resetMode === 'CW') effectiveReset = 'CW';
  else if (onTempReset && (resetMode === 'CHW' || resetMode === '')) effectiveReset = 'CHW';

  const navItem = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2.5 text-[13px] rounded-full transition-all ${
      active
        ? 'bh-nav-active font-semibold'
        : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
    }`;

  const subItem = (active: boolean) =>
    `flex items-center gap-2 px-3 py-1.5 text-[12px] rounded-full transition-colors ${
      active ? 'bg-violet-500/25 text-violet-100 font-semibold' : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
    }`;

  const Group: React.FC<{
    title: string;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }> = ({ title, expanded, onToggle, children }) => (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-[12px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-white/[0.04]"
      >
        <span className="truncate">{title}</span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        )}
      </button>
      {expanded && <div className="ml-1 mb-2 space-y-0.5">{children}</div>}
    </div>
  );

  const OppLink: React.FC<{ href: string; id: string; label?: string; active: boolean }> = ({
    href,
    id,
    label,
    active,
  }) => (
    <Link href={href} className={subItem(active)} title={label}>
      <span className={`font-mono w-8 shrink-0 ${active ? 'text-violet-200' : 'text-slate-600'}`}>{id}</span>
      <span className="leading-snug truncate">{label}</span>
    </Link>
  );

  const scheduling = opportunitiesForSection('scheduling');
  const plant = opportunitiesForSection('plant-control');
  const vent = opportunitiesForSection('ventilation');
  const vs = opportunitiesForSection('variable-speed');
  const om = opportunitiesForSection('operations');

  return (
    <aside className="hvac-sidebar w-[17rem] flex flex-col select-none overflow-hidden bg-[#1a1a1d] text-slate-200 min-h-0">
      <div className="px-4 py-4 shrink-0">
        <div className="text-[13px] font-semibold text-white tracking-tight leading-none">HVAC Control</div>
        <div className="text-[10px] text-slate-500 mt-1">OEH · O1–O20</div>
      </div>
      <nav className="px-2.5 pb-3 space-y-0.5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-slate-600 uppercase">Platform</div>
        <Link href="/overview" className={navItem(isActive('/overview') || isActive('/'))}>
          Dashboard
        </Link>
        <Link href="/agents" className={navItem(isActive('/agents'))}>
          Systems
        </Link>
        <Link href="/platform/bms" className={navItem(pathname.startsWith('/platform/bms'))}>
          Gateway
        </Link>
        <Link href="/platform/telemetry" className={navItem(pathname.startsWith('/platform/telemetry'))}>
          Telemetry
        </Link>
        <Link href="/ml" className={navItem(isActive('/ml') || pathname.startsWith('/ml'))}>
          ML Registry
        </Link>
        <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-slate-600 uppercase">Opportunities</div>
        <Group
          title="Scheduling"
          expanded={open.scheduling}
          onToggle={() => setOpen((s) => ({ ...s, scheduling: !s.scheduling }))}
        >
          <Link href="/agents/scheduling" className={subItem(isActive('/agents/scheduling'))}>
            Dashboard
          </Link>
          {scheduling.map((o) => (
            <OppLink
              key={o.id}
              href={o.route}
              id={o.id}
              label={o.shortLabel}
              active={pathname.startsWith(o.route) || (o.id === 'O1' && pathname.includes('optimum-start-stop'))}
            />
          ))}
        </Group>

        <Group
          title="Plant Control"
          expanded={open.plant}
          onToggle={() => setOpen((s) => ({ ...s, plant: !s.plant }))}
        >
          <Link href="/agents/plant-control" className={subItem(isActive('/agents/plant-control'))}>
            Dashboard
          </Link>
          <OppLink
            href="/agents/plant-control/duct-static-pressure"
            id="O5"
            label={plant.find((o) => o.id === 'O5')?.shortLabel}
            active={isActive('/agents/plant-control/duct-static-pressure')}
          />
          <div>
            <Link href="/agents/plant-control/temperature-reset" className={subItem(false)}>
              <span className="font-mono w-8 shrink-0 text-slate-600">O6–8</span>
              <span className="leading-snug truncate">Temperature Reset</span>
            </Link>
            <div className="ml-4 mt-0.5 space-y-0.5">
              <Link href="/agents/plant-control/temperature-reset?mode=HHW" className={subItem(effectiveReset === 'HHW')}>
                <span className={`font-mono w-8 shrink-0 ${effectiveReset === 'HHW' ? 'text-violet-200' : 'text-slate-600'}`}>O6</span>
                Heating Hot Water
              </Link>
              <Link href="/agents/plant-control/temperature-reset?mode=CHW" className={subItem(effectiveReset === 'CHW')}>
                <span className={`font-mono w-8 shrink-0 ${effectiveReset === 'CHW' ? 'text-violet-200' : 'text-slate-600'}`}>O7</span>
                Chilled Water
              </Link>
              <Link href="/agents/plant-control/temperature-reset?mode=CW" className={subItem(effectiveReset === 'CW')}>
                <span className={`font-mono w-8 shrink-0 ${effectiveReset === 'CW' ? 'text-violet-200' : 'text-slate-600'}`}>O8</span>
                Condenser Water
              </Link>
            </div>
          </div>
          <OppLink
            href="/agents/plant-control/electronic-expansion-valve"
            id="O9"
            label={plant.find((o) => o.id === 'O9')?.shortLabel}
            active={isActive('/agents/plant-control/electronic-expansion-valve')}
          />
        </Group>

        <Group
          title="Ventilation"
          expanded={open.vent}
          onToggle={() => setOpen((s) => ({ ...s, vent: !s.vent }))}
        >
          <Link href="/agents/ventilation-airflow" className={subItem(pathname === '/agents/ventilation-airflow')}>
            Dashboard
          </Link>
          {vent.map((o) => (
            <OppLink
              key={o.id}
              href={o.route}
              id={o.id}
              label={o.shortLabel}
              active={isActive(o.route)}
            />
          ))}
        </Group>

        <Group
          title="Variable Speed"
          expanded={open.vs}
          onToggle={() => setOpen((s) => ({ ...s, vs: !s.vs }))}
        >
          <Link href="/agents/variable-speed" className={subItem(pathname === '/agents/variable-speed')}>
            Dashboard
          </Link>
          {vs.map((o) => (
            <OppLink key={o.id} href={o.route} id={o.id} label={o.shortLabel} active={isActive(o.route)} />
          ))}
        </Group>

        <Group
          title="Operations"
          expanded={open.om}
          onToggle={() => setOpen((s) => ({ ...s, om: !s.om }))}
        >
          <Link href="/agents/operations-maintenance" className={subItem(pathname === '/agents/operations-maintenance')}>
            Dashboard
          </Link>
          {om.map((o) => (
            <OppLink key={o.id} href={o.route} id={o.id} label={o.shortLabel} active={isActive(o.route)} />
          ))}
        </Group>
      </nav>
      <div className="shrink-0 border-t border-white/[0.06] px-3 py-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={bmsStatus === 'CONNECTED' ? 'live' : 'muted'} pulse={false}>
          BMS {bmsStatus}
        </StatusBadge>
        <StatusBadge tone={telemetryLabel === 'LIVE' ? 'live' : 'warn'} pulse={false}>
          TEL {telemetryLabel}
        </StatusBadge>
      </div>
    </aside>
  );
};
