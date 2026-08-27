import { apiJson } from '@/lib/api/client';
import type { O15Command, O15Dashboard, O15HistoryResponse } from '@/lib/hvac/o15Types';

const BASE = '/agents/variable-speed/o15';

export async function fetchO15Dashboard(): Promise<O15Dashboard> {
  return apiJson(`${BASE}/dashboard`);
}

export async function fetchO15History(hours: number): Promise<O15HistoryResponse> {
  return apiJson(`${BASE}/history?hours=${hours}`);
}

export async function postO15Optimize(): Promise<O15Dashboard> {
  return apiJson(`${BASE}/optimize`, { method: 'POST', body: JSON.stringify({}) });
}

export async function postO15Apply(commandId: string, confirm: boolean): Promise<O15Command> {
  return apiJson(`${BASE}/commands/${commandId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  });
}

export async function postO15Verify(commandId: string): Promise<{ ok?: boolean; command?: O15Command }> {
  return apiJson(`${BASE}/commands/${commandId}/verify`, { method: 'POST', body: '{}' });
}

export async function postO15Rollback(commandId: string): Promise<{ ok?: boolean; command?: O15Command }> {
  return apiJson(`${BASE}/commands/${commandId}/rollback`, { method: 'POST', body: '{}' });
}

export async function postO15SafeMode(reason?: string): Promise<{ safeMode?: boolean }> {
  return apiJson(`${BASE}/safe-mode`, { method: 'POST', body: JSON.stringify({ reason }) });
}
