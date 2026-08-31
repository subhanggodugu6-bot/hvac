import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function apiOrigin(): string {
  const raw = process.env['HVAC_API_ORIGIN'] || process.env['NEXT_PUBLIC_API_URL'] || '';
  if (raw) {
    return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
  }
  return 'http://127.0.0.1:8000';
}

async function proxy(req: NextRequest, path: string[]) {
  const dest = `${apiOrigin()}/api/${path.join('/')}${req.nextUrl.search}`;
  try {
    const headers = new Headers();
    const skip = new Set([
      'host',
      'connection',
      'content-length',
      'transfer-encoding',
      'accept-encoding',
    ]);
    req.headers.forEach((value, key) => {
      if (!skip.has(key.toLowerCase())) headers.set(key, value);
    });
    const method = req.method.toUpperCase();
    const res = await fetch(dest, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer(),
      cache: 'no-store',
    });
    const buf = await res.arrayBuffer();
    const out = new Headers();
    res.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) return;
      out.set(key, value);
    });
    return new NextResponse(buf, { status: res.status, headers: out });
  } catch {
    return NextResponse.json(
      {
        code: 'BACKEND_OFFLINE',
        message: 'HVAC API is unreachable. Set HVAC_API_ORIGIN to the live FastAPI URL.',
      },
      { status: 503 }
    );
  }
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
