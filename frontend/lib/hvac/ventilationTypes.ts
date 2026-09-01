export type TelemetryValue = number | null;

export type TelemetryUiState = 'LIVE' | 'DEGRADED' | 'OFFLINE' | 'NO DATA' | 'API ERROR' | string;

export interface VentilationTelemetry {
  state: TelemetryUiState | null;
  raw?: string | null;
  lastUpdated?: string | null;
  ageSeconds?: number | null;
  source?: string | null;
  quality?: string | null;
  label?: string | null;
}

export interface VentilationEnergy {
  currentKw?: TelemetryValue;
  optimizedKw?: TelemetryValue;
  instantaneousKw?: TelemetryValue;
  savingKw?: TelemetryValue;
  dailyKwh?: TelemetryValue;
  measuredImpactKw?: TelemetryValue;
  verifiedImpactKw?: TelemetryValue;
  measuredDailyKwh?: TelemetryValue;
  verifiedDailyKwh?: TelemetryValue;
}

export interface VentilationOpportunity {
  id: string;
  opportunityId?: string;
  name?: string | null;
  description?: string | null;
  route?: string | null;
  status?: string | null;
  telemetryStatus?: string | null;
  telemetry?: VentilationTelemetry | null;
  current?: {
    airflowCfm?: TelemetryValue;
    damperPct?: TelemetryValue;
    fanKw?: TelemetryValue;
    co2Ppm?: TelemetryValue;
    coPpm?: TelemetryValue;
    occupancy?: number | null;
  } | null;
  optimized?: {
    airflowCfm?: TelemetryValue;
    damperPct?: TelemetryValue;
    fanKw?: TelemetryValue;
    co2Ppm?: TelemetryValue;
  } | null;
  energy?: VentilationEnergy | null;
  mv?: {
    measuredImpactKw?: TelemetryValue;
    verifiedImpactKw?: TelemetryValue;
    measuredDailyKwh?: TelemetryValue;
    verifiedDailyKwh?: TelemetryValue;
    status?: string | null;
    method?: string | null;
  } | null;
  delta?: { airflowCfm?: TelemetryValue; reductionCfm?: TelemetryValue; reductionPct?: TelemetryValue } | null;
  confidence?: TelemetryValue;
  safety?: { status?: string | null; passed?: boolean | null } | null;
  recommendation?: {
    action?: string | null;
    rationale?: string | null;
    current?: TelemetryValue;
    recommended?: TelemetryValue;
    expectedImpactKw?: TelemetryValue;
    confidence?: TelemetryValue;
    safety?: string | null;
    timestamp?: string | null;
  } | null;
  supervisory?: {
    decision?: string | null;
    reason?: string | null;
    current?: TelemetryValue;
    recommended?: TelemetryValue;
    delta?: TelemetryValue;
    confidence?: TelemetryValue;
    safety?: string | null;
  } | null;
  dispatch?: {
    eligible?: boolean;
    status?: string | null;
    rollbackAvailable?: boolean;
    command?: string | null;
    target?: TelemetryValue;
    timestamp?: string | null;
    source?: string | null;
    verification?: string | null;
    blockReason?: string | null;
    blockCode?: string | null;
  } | null;
  failSafe?: {
    previous?: TelemetryValue;
    recommended?: TelemetryValue;
    dispatch?: string | null;
    rollback?: TelemetryValue;
    available?: boolean;
    policy?: string | null;
  } | null;
  metrics?: Record<string, unknown> | null;
  timestamp?: string | null;
  source?: string | null;
  bmsConnected?: boolean;
  classified?: string | null;
  live?: boolean;
}

export interface VentilationDashboardData {
  module?: {
    name?: string;
    subtitle?: string;
    ids?: string[];
    bms?: { status?: string | null; detail?: string | null };
    telemetry?: VentilationTelemetry;
    agentStatus?: string | null;
    mode?: string | null;
    safetyStatus?: string | null;
    kpis?: {
      telemetry?: string | null;
      activeOptimizations?: number | null;
      currentAirflowCfm?: TelemetryValue;
      optimizedAirflowCfm?: TelemetryValue;
      currentKw?: TelemetryValue;
      optimizedKw?: TelemetryValue;
      savingsKw?: TelemetryValue;
      safety?: string | null;
      liveCount?: number | null;
    };
  };
  opportunities?: VentilationOpportunity[];
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
