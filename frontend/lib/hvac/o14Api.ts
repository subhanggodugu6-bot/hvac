import { apiJson } from '@/lib/api/client';

const BASE = '/agents/variable-speed/o14';

export async function fetchO14Dashboard() {
  return apiJson(`${BASE}/dashboard`);
}

export async function fetchO14History(hours: number) {
  return apiJson(`${BASE}/history?hours=${hours}`);
}

export async function postO14Optimize() {
  return apiJson(`${BASE}/optimize`, { method: 'POST', body: JSON.stringify({}) });
}

export async function postO14Apply(commandId: string, confirm: boolean) {
  return apiJson(`${BASE}/commands/${commandId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  });
}

export async function postO14Verify(commandId: string) {
  return apiJson(`${BASE}/commands/${commandId}/verify`, { method: 'POST', body: '{}' });
}

export async function postO14Rollback(commandId: string) {
  return apiJson(`${BASE}/commands/${commandId}/rollback`, { method: 'POST', body: '{}' });
}

export async function postO14SafeMode(reason?: string) {
  return apiJson(`${BASE}/safe-mode`, { method: 'POST', body: JSON.stringify({ reason }) });
}
