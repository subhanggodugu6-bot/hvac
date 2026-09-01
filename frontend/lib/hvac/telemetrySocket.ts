/** Single FastAPI telemetry WebSocket. No credentials. No commands. */
import { backendWsOrigin } from '@/lib/api/client';
export type WsConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export type TelemetryEvent = {
  equipment_id?: string | null;
  point?: string | null;
  point_id?: string | null;
  value?: number | null;
  unit?: string | null;
  quality?: string | null;
  source?: string | null;
  timestamp?: string | null;
  live?: boolean;
  building_id?: string | null;
};

export type TelemetryFrame = {
  bms?: {
    status?: string;
    protocol?: string | null;
    lastError?: string | null;
    last_error?: string | null;
    host?: string | null;
    port?: number | null;
  };
  telemetry?: { status?: string; ageSeconds?: number | null; quality?: string | null; source?: string | null };
  safeMode?: boolean;
  controlEnabled?: boolean;
  controlLabel?: string;
  mode?: string;
  plantMode?: string | null;
  events?: TelemetryEvent[];
  count?: number;
};

type Listener = (frame: TelemetryFrame, state: WsConnectionState) => void;

function websocketUrl(): string {
  if (typeof window !== 'undefined') {
    const backend = backendWsOrigin();
    if (backend) {
      const p = backend.startsWith('https') ? 'wss:' : 'ws:';
      const host = backend.replace(/^https?:\/\//, '');
      return `${p}//${host}/api/ws/telemetry`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/ws/telemetry`;
  }
  return 'ws://127.0.0.1:8000/api/ws/telemetry';
}

class TelemetrySocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stopped = true;
  state: WsConnectionState = 'idle';
  lastFrame: TelemetryFrame | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.lastFrame) fn(this.lastFrame, this.state);
    this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private emit(state: WsConnectionState, frame?: TelemetryFrame) {
    this.state = state;
    if (frame) this.lastFrame = frame;
    this.listeners.forEach((fn) => fn(this.lastFrame || {}, this.state));
  }

  start() {
    if (typeof window === 'undefined') return;
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.state = 'closed';
  }

  private connect() {
    if (this.stopped) return;
    this.emit('connecting');
    try {
      const ws = new WebSocket(websocketUrl());
      this.ws = ws;
      ws.onopen = () => {
        this.attempt = 0;
        this.emit('open');
      };
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse(String(ev.data)) as TelemetryFrame;
          this.emit('open', frame);
        } catch {
          this.emit('error');
        }
      };
      ws.onerror = () => this.emit('error');
      ws.onclose = () => {
        this.ws = null;
        this.emit('closed');
        this.schedule();
      };
    } catch {
      this.emit('error');
      this.schedule();
    }
  }

  private schedule() {
    if (this.stopped) return;
    const delay = Math.min(15000, 500 * 2 ** Math.min(this.attempt, 5));
    this.attempt += 1;
    this.timer = setTimeout(() => this.connect(), delay);
  }
}

export const telemetrySocket = new TelemetrySocket();
