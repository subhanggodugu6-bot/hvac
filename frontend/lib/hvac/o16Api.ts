import { apiJson } from '@/lib/api/client';
import type { O16Command, O16Dashboard, O16HistoryResponse, O16TelemetryResponse } from '@/lib/hvac/o16Types';

const BASE = '/agents/variable-speed/o16';

export async function fetchO16Dashboard(): Promise<O16Dashboard> {
  return apiJson(`${BASE}/dashboard`);
}

export async function fetchO16Telemetry(): Promise<O16TelemetryResponse> {
  return apiJson(`${BASE}/telemetry`);
}

export async function fetchO16History(hours: number): Promise<O16HistoryResponse> {
  return apiJson(`${BASE}/history?hours=${hours}`);
}

export async function postO16Optimize(): Promise<O16Dashboard> {
  return apiJson(`${BASE}/optimize`, { method: 'POST', body: JSON.stringify({}) });
}

export async function postO16Apply(commandId: string, confirm: boolean): Promise<O16Command> {
  return apiJson(`${BASE}/commands/${commandId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  });
}

export async function postO16Approve(commandId: string): Promise<O16Command> {
  return apiJson(`${BASE}/commands/${commandId}/approve`, { method: 'POST', body: '{}' });
}

export async function postO16Verify(commandId: string): Promise<{ ok?: boolean; command?: O16Command }> {
  return apiJson(`${BASE}/commands/${commandId}/verify`, { method: 'POST', body: '{}' });
}

export async function postO16Rollback(commandId: string): Promise<{ ok?: boolean; command?: O16Command }> {
  return apiJson(`${BASE}/commands/${commandId}/rollback`, { method: 'POST', body: '{}' });
}

export async function postO16SafeMode(reason?: string): Promise<{ safeMode?: boolean }> {
  return apiJson(`${BASE}/safe-mode`, { method: 'POST', body: JSON.stringify({ reason }) });
}
