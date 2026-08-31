function publicApiBase(): string | undefined {
  const pub = process.env['NEXT_PUBLIC_API_URL'];
  if (pub && /^https?:/i.test(pub)) return pub.replace(/\/$/, '');
  return undefined;
}

export const API_BASE =
  publicApiBase() ||
  (typeof window !== 'undefined'
    ? '/api'
    : process.env['HVAC_API_ORIGIN']
      ? `${process.env['HVAC_API_ORIGIN'].replace(/\/$/, '')}/api`
      : 'http://localhost:8000/api');

/** Turn `/api/...`, `/platform/...`, or a full URL into a fetchable API URL. */
export function resolveApiUrl(input: string): string {
  if (/^https?:/i.test(input)) return input;
  let suffix = input.startsWith('/') ? input : `/${input}`;
  if (suffix.startsWith('/api/')) suffix = suffix.slice(4);
  else if (suffix === '/api') suffix = '';
  const direct = publicApiBase();
  if (direct) return `${direct}${suffix}`;
  if (typeof window !== 'undefined') return `/api${suffix}`;
  return `${API_BASE}${suffix}`;
}

export class ApiError extends Error {
  code?: string;
  requestId?: string;
  status: number;
  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function requestId(): string {
  return `req_${Math.random().toString(16).slice(2, 14)}`;
}

async function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Unauthenticated HVAC API client: request IDs, structured errors, timeout, one retry on GET. */
export async function hvacFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = resolveApiUrl(input);
  const headers = new Headers(init.headers || {});
  if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", requestId());
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const method = (init.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let last: Response | undefined;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await fetchWithTimeout(url, { ...init, headers }, 90000);
      if (last.status >= 500 && i < attempts - 1) continue;
      return last;
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1) throw e;
    }
  }
  if (last) return last;
  throw lastErr instanceof Error ? lastErr : new Error("NETWORK ERROR");
}

/** Browser uses NEXT_PUBLIC_API_URL when set (Render); otherwise same-origin `/api`. */
export async function apiJson(path: string, init: RequestInit = {}) {
  const res = await hvacFetch(path, { ...init, cache: init.cache ?? "no-store" });
  if (!res.ok) {
    let message = `DATA SOURCE ERROR ${res.status}`;
    let code: string | undefined;
    let rid = res.headers.get("X-Request-ID") || undefined;
    try {
      const body = await res.json();
      code = body.code || body.detail?.code;
      message = body.message || body.detail?.message || (typeof body.detail === "string" ? body.detail : message);
      rid = body.request_id || rid;
    } catch {
      /* keep */
    }
    throw new ApiError(res.status, message, code, rid);
  }
  if (res.status === 204) return null;
  return res.json();
}
