export type GuideCat = 'scheduling' | 'plant' | 'ventilation' | 'variablespeed' | 'om';

export const GUIDE_CATS: Record<GuideCat, { label: string; color: string; dim: string }> = {
  scheduling: { label: 'Scheduling & Set Points', color: '#F0A93A', dim: 'rgba(240,169,58,0.15)' },
  plant: { label: 'Plant Control Parameters', color: '#4FD1C5', dim: 'rgba(79,209,197,0.15)' },
  ventilation: { label: 'Ventilation & Air Flow', color: '#5B9BD5', dim: 'rgba(91,155,213,0.15)' },
  variablespeed: { label: 'Variable Speed Systems', color: '#9C7BDB', dim: 'rgba(156,123,219,0.15)' },
  om: { label: 'Operations & Maintenance', color: '#6FCF97', dim: 'rgba(111,207,151,0.15)' },
};

export function guideNumericId(opportunityId: string): number | null {
  const m = /^O(\d+)$/i.exec((opportunityId || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 20) return null;
  return n;
}

export function guideCatForOpportunityId(opportunityId: string): GuideCat {
  if (opportunityId === 'O6-O8') return 'plant';
  const n = guideNumericId(opportunityId);
  if (n == null) return 'scheduling';
  if (n <= 4) return 'scheduling';
  if (n <= 9) return 'plant';
  if (n <= 13) return 'ventilation';
  if (n <= 16) return 'variablespeed';
  return 'om';
}
