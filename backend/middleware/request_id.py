"""Request ID context + Starlette middleware."""
from __future__ import annotations

import threading
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_ctx: ContextVar[Optional[str]] = ContextVar("hvac_request_id", default=None)

_HYDRATE_STARTED = threading.Event()


def current_request_id() -> str:
    rid = request_id_ctx.get()
    if rid:
        return rid
    return f"req_{uuid.uuid4().hex[:12]}"


def _start_hydration_once() -> None:
    """Seed the demo dataset off the request path.

    Seeding writes hundreds of rows, which on a small instance is far slower than
    any browser will wait, so a request must never block on it.
    """
    if _HYDRATE_STARTED.is_set():
        return
    _HYDRATE_STARTED.set()

    def _run() -> None:
        try:
            from backend.bms.simulation_telemetry import hydrate_synthetic_dataset

            hydrate_synthetic_dataset()
        except Exception:
            pass

    threading.Thread(target=_run, name="hvac-hydrate", daemon=True).start()


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id") or request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:12]}"
        token = request_id_ctx.set(rid)
        path = request.url.path or ""
        if path not in ("/healthz", "/api/healthz", "/api/health", "/readyz", "/api/readyz", "/api/ready"):
            _start_hydration_once()
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = rid
        return response
