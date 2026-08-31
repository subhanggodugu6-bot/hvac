import { fleetOpportunityCards } from '@/lib/hvac/opportunityConfig';

export type PlantTone = 'good' | 'stale' | 'bad' | 'missing' | 'unmapped';

export type PlantPoint = {
  value?: unknown;
  unit?: string | null;
  quality?: string | null;
  display?: unknown;
};

export type PlantEquipment = {
  equipment_id: string;
  tone?: PlantTone;
  points: Record<string, PlantPoint>;
};

export type DashboardAlert = {
  severity: string;
  point_id?: string | null;
  equipment_id?: string | null;
  message: string;
  age_seconds?: number | null;
};

export type DashboardOpportunity = {
  id: string;
  title?: string;
  href?: string | null;
  guide_page?: number;
  section?: string;
  guide_savings_potential?: string | null;
  energy_impact_class?: string;
  applicability?: string;
  practice?: string | null;
  telemetry?: string;
  kind?: string;
  control?: string;
  missing_features?: string[];
};

export type DashboardChapter = {
  id: string;
  title: string;
  section: string;
  href: string;
  counts: { live: number; simulated: number; awaiting: number };
  opportunities: DashboardOpportunity[];
};

export type DashboardHome = {
  plantMode?: string;
  bms?: { status?: string; last_error?: string; lastError?: string; protocol?: string };
  telemetry?: { status?: string; source?: string; quality?: string; ageSeconds?: number | null };
  building?: { id?: string; name?: string; location?: string };
  kpis?: {
    coolingTons?: number | null;
    comfortPct?: number | null;
    verifiedKw?: number | null;
    alertCount?: number;
  };
  layers?: Record<string, PlantEquipment[]>;
  alerts?: DashboardAlert[];
  chapters?: DashboardChapter[];
  energy?: { unit?: string; points?: { t?: string; v?: number; point_id?: string }[] };
  guide?: { document?: string; note?: string };
  controlLabel?: string;
  provenance?: string;
  hasCoPoints?: boolean;
};

export const LAYER_GROUPS: { key: string; title: string }[] = [
  { key: 'chillers', title: 'Chillers' },
  { key: 'ahus', title: 'AHUs' },
  { key: 'pumps', title: 'Pumps' },
  { key: 'vfds', title: 'VFDs' },
  { key: 'condenser_water', title: 'Condenser water' },
  { key: 'hot_water', title: 'Hot water' },
  { key: 'zones', title: 'Zones' },
  { key: 'vavs', title: 'VAVs' },
];

export const HUB_RAIL: Record<string, string> = {
  scheduling: 'var(--cat-scheduling)',
  'plant-control': 'var(--cat-plant)',
  ventilation: 'var(--cat-ventilation)',
  'variable-speed': 'var(--cat-variablespeed)',
  operations: 'var(--cat-om)',
};

export function mappingHref(equipmentId?: string | null, point?: string | null) {
  const q = new URLSearchParams();
  q.set('tab', 'mapping');
  if (equipmentId) q.set('equipment', equipmentId);
  if (point) q.set('point', point);
  return `/platform/bms?${q.toString()}`;
}

const CHAPTER_COPY: { id: string; title: string; section: string; href: string }[] = [
  {
    id: 'scheduling',
    title: 'Scheduling',
    section: 'Section 2 – System supervisory control optimisations',
    href: '/agents/scheduling',
  },
  {
    id: 'plant-control',
    title: 'Plant Control',
    section: 'Section 3 – Plant control parameter optimisations',
    href: '/agents/plant-control',
  },
  {
    id: 'ventilation',
    title: 'Ventilation',
    section: 'Section 4 – Ventilation and air flow optimisations',
    href: '/agents/ventilation-airflow',
  },
  {
    id: 'variable-speed',
    title: 'Variable Speed',
    section: 'Section 5 – Variable speed based optimisations',
    href: '/agents/variable-speed',
  },
  {
    id: 'operations',
    title: 'Operations & Maintenance',
    section: 'Section 6 – Best practice HVAC operation and maintenance',
    href: '/agents/operations-maintenance',
  },
];

/** OEH Table 1 rows from the in-app catalog (titles/routes). Telemetry stays NO DATA until the API answers. */
export function catalogChapters(): DashboardChapter[] {
  const cards = fleetOpportunityCards();
  return CHAPTER_COPY.map((meta) => {
    const opps = cards.filter((c) => c.section === meta.id || (meta.id === 'ventilation' && c.section === 'ventilation'));
    return {
      ...meta,
      counts: { live: 0, simulated: 0, awaiting: opps.length },
      opportunities: opps.map((o) => ({
        id: o.id,
        title: o.title,
        href: o.route,
        telemetry: 'NO DATA',
        applicability: 'Catalog',
        guide_savings_potential: 'GUIDE_POTENTIAL',
      })),
    };
  });
}

export function mergeDashboardChapters(live?: DashboardChapter[] | null): DashboardChapter[] {
  const catalog = catalogChapters();
  if (!live?.length) return catalog;
  const byId = new Map(live.map((c) => [c.id, c]));
  return catalog.map((c) => {
    const hit = byId.get(c.id);
    if (hit?.opportunities?.length) return hit;
    return c;
  });
}
