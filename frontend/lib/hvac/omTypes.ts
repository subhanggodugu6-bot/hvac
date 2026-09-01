export type OperationsOpportunityId = 'O17' | 'O18' | 'O19' | 'O20';
export type TelemetryValue = number | null;

export interface OmSeriesPoint {
  label?: string;
  time?: string;
  baseline?: number;
  actual?: number;
  target?: number;
  health?: number;
  filterDpRise?: number;
  fanKw?: number;
  overrides?: number;
  drift?: number;
  stale?: number;
  failed?: number;
}

export interface OmControlPoint {
  point?: string;
  equipment?: string;
  pointType?: string;
  currentValue?: string | number;
  referenceValue?: string | number;
  quality?: string;
  override?: boolean;
  drift?: boolean;
  lastSeen?: string;
  status?: string;
}

export interface OmOpportunity {
  id: OperationsOpportunityId | string;
  opportunityId?: string;
  name?: string | null;
  description?: string | null;
  route?: string | null;
  status?: string | null;
  telemetryStatus?: string | null;
  telemetry?: {
    status?: string | null;
    state?: string | null;
    raw?: string | null;
    timestamp?: string | null;
    lastUpdated?: string | null;
    ageSeconds?: number | null;
    source?: string | null;
    quality?: string | null;
    label?: string | null;
  } | null;
  current?: {
    kw?: TelemetryValue;
    baselineKw?: TelemetryValue;
    targetKw?: TelemetryValue;
    trainingCoveragePct?: TelemetryValue;
    trainingItems?: TelemetryValue;
    affectedUsers?: TelemetryValue;
    operatorReadiness?: string | null;
    equipmentHealthPct?: TelemetryValue;
    assetsAtRisk?: TelemetryValue;
    maintenanceAlerts?: TelemetryValue;
    maintenanceRisk?: string | null;
    controllerHealth?: string | null;
    softwareVersion?: string | null;
    controlPoints?: TelemetryValue;
    healthyPoints?: TelemetryValue;
    degradedPoints?: TelemetryValue;
    overrides?: TelemetryValue;
    driftCount?: TelemetryValue;
    criticalIssues?: TelemetryValue;
    controlHealthPct?: TelemetryValue;
    occupancy?: number | null;
  } | null;
  optimized?: { kw?: TelemetryValue; savingsKw?: TelemetryValue } | null;
  delta?: { kw?: TelemetryValue; savingsKw?: TelemetryValue } | null;
  energy?: {
    currentKw?: TelemetryValue;
    baselineKw?: TelemetryValue;
    targetKw?: TelemetryValue;
    savingKw?: TelemetryValue;
    dailyKwh?: TelemetryValue;
    monthlyKwh?: TelemetryValue;
    peakDemandKw?: TelemetryValue;
    impactKw?: TelemetryValue;
    impactKwhDay?: TelemetryValue;
  } | null;
  safety?: { status?: string | null; passed?: boolean | null } | null;
  recommendation?: {
    action?: string | null;
    rationale?: string | null;
    confidence?: TelemetryValue;
    priority?: string | null;
    expectedImpactKw?: TelemetryValue;
    safety?: string | null;
    timestamp?: string | null;
    evidence?: string[] | null;
  } | null;
  supervisory?: {
    decision?: string | null;
    reason?: string | null;
    confidence?: TelemetryValue;
    safety?: string | null;
    currentState?: string | null;
    recommendedState?: string | null;
  } | null;
  dispatch?: {
    eligible?: boolean;
    status?: string | null;
    rollbackAvailable?: boolean;
    blockReason?: string | null;
    blockCode?: string | null;
    actionType?: string | null;
  } | null;
  failSafe?: {
    available?: boolean;
    policy?: string | null;
    previousState?: string | null;
    requestedState?: unknown;
    rollbackState?: unknown;
  } | null;
  confidence?: TelemetryValue;
  priority?: string | null;
  metrics?: Record<string, unknown> | null;
  charts?: Record<string, TelemetryValue> | null;
  series?: {
    energyPlanning?: Record<string, OmSeriesPoint[]>;
    maintenanceTrend?: Record<string, OmSeriesPoint[]>;
    controlHealth?: Record<string, OmSeriesPoint[]>;
  } | null;
  controlPoints?: OmControlPoint[] | null;
  metadata?: { agent?: string | null; dataQuality?: string | null; opportunityId?: string | null } | null;
  audit?: { timestamp?: string | null; event_type?: string | null; message?: string | null; actor?: string | null; confidence?: number | null }[];
  timestamp?: string | null;
  source?: string | null;
  bmsConnected?: boolean;
  classified?: string | null;
  classified_telemetry?: {
    status?: string | null;
    source?: string | null;
    quality?: string | null;
    age_seconds?: number | null;
  } | null;
  live?: boolean;
}

export interface OmDashboardData {
  module?: {
    name?: string;
    subtitle?: string;
    ids?: string[];
    bms?: { status?: string | null; detail?: string | null };
    bmsConnected?: boolean;
    telemetry?: OmOpportunity['telemetry'];
    agentStatus?: string | null;
    agentLabel?: string | null;
    mode?: string | null;
    safetyStatus?: string | null;
    kpis?: {
      opportunities?: number | null;
      activeRecommendations?: number | null;
      energySavingsKw?: TelemetryValue;
      energySavingsKwhDay?: TelemetryValue;
      energySavingsKwhMonth?: TelemetryValue;
      maintenancePriority?: string | null;
      controlHealthPct?: TelemetryValue;
      telemetry?: string | null;
      activeOptimizations?: number | null;
      energyOpportunityKw?: TelemetryValue;
      maintenanceRisk?: string | null;
      safety?: string | null;
      dataQuality?: string | null;
      liveCount?: number | null;
    };
  };
  opportunities?: OmOpportunity[];
  charts?: {
    energyPlanning?: { currentKw?: TelemetryValue; baselineKw?: TelemetryValue; targetKw?: TelemetryValue; savingsKw?: TelemetryValue };
    training?: { completion?: TelemetryValue; items?: TelemetryValue; affectedUsers?: TelemetryValue };
    maintenance?: { health?: TelemetryValue; alerts?: TelemetryValue; energyLossKw?: TelemetryValue; priority?: string | null };
    control?: { healthy?: TelemetryValue; degraded?: TelemetryValue; overrides?: TelemetryValue; drift?: TelemetryValue; critical?: TelemetryValue; healthPct?: TelemetryValue };
  };
  timestamp?: string | null;
}

export function metricNum(metrics: Record<string, unknown> | null | undefined, key: string): TelemetryValue {
  if (!metrics) return null;
  const v = metrics[key];
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function metricStr(metrics: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!metrics) return null;
  const v = metrics[key];
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  if (s === 'undefined' || s === 'null' || s === 'NaN') return null;
  return s;
}

/** Never render raw HTTP status codes as KPI values. */
export function displayKpiText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const s = String(value);
  if (s === 'undefined' || s === 'null' || s === 'NaN') return null;
  if (/^(404|409|410|500|502|503)$/.test(s.trim())) return null;
  return s;
}
