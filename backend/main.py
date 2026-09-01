import os
import sys
from contextlib import asynccontextmanager

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_BACKEND = os.path.dirname(os.path.abspath(__file__))
if _BACKEND not in sys.path:
    sys.path.append(_BACKEND)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from backend.cloud_env import apply_cloud_demo_env  # noqa: E402

apply_cloud_demo_env()


def _load_root_env() -> None:
    path = os.path.join(_ROOT, ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        return


_load_root_env()
if "pytest" not in sys.modules and os.getenv("HVAC_BMS_MODE", "simulation").strip().lower() in (
    "simulation",
    "simulator",
    "sim",
):
    os.environ["HVAC_USE_SIMULATION"] = "1"
    os.environ["HVAC_ALLOW_SIM_WRITES"] = "1"

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes import router as api_router
from api.websocket import ws_router
from api.plant_control_controller import router as plant_control_router
from api.variable_speed_controller import router as variable_speed_router
from api.o14_controller import router as o14_router
from api.o15_controller import router as o15_router
from api.o16_controller import router as o16_router
from api.hvac_ventilation_controller import router as hvac_ventilation_router
from api.hvac_operations_maintenance_controller import router as hvac_om_router
from api.platform_controller import router as platform_router
from api.v1_controller import router as v1_router
from api.oeh_guide_controller import router as oeh_guide_router
from api.ml_controller import router as ml_router
from api.bms_controller import router as bms_router, safety_router as bms_safety_router, agents_router as bms_agents_router
from database.session import init_db, database_ok
from database.seed.seed_data import seed_database
from agents.scheduling_supervisory.worker import control_worker
from backend.middleware.request_id import RequestIdMiddleware, current_request_id
from backend.services.logging_service import log_event


def _error_body(code: str, message: str, status_code: int, details=None) -> dict:
    body = {"code": code, "message": message, "request_id": current_request_id(), "status": status_code}
    if details is not None:
        body["details"] = details
    return body


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("HVAC_START_CONTROL_WORKER", "1") in ("1", "true", "TRUE"):
        try:
            from backend.workers.control_worker import start
            start()
        except Exception:
            pass
    try:
        from backend.services.platform_ops_service import apply_plant_mode, get_plant_mode

        apply_plant_mode(get_plant_mode())
    except Exception:
        pass
    try:
        from backend.bms.connection_manager import auto_connect_if_configured

        auto_connect_if_configured()
    except Exception:
        pass
    try:
        from backend.bms.telemetry_reader import start_reader, stop_reader
        start_reader()
    except Exception:
        pass
    try:
        from backend.bms.simulation_telemetry import start_simulation_telemetry, stop_simulation_telemetry
        # A short feed interval starves a small instance, so it is tunable.
        start_simulation_telemetry(
            interval=float(os.getenv("HVAC_SIM_FEED_SECONDS", "20")),
            force=os.getenv("HVAC_USE_SIMULATION", "0") in ("1", "true", "TRUE"),
        )
    except Exception:
        pass
    try:
        from backend.services.dashboard_home_service import prime_dashboard_home

        prime_dashboard_home()
    except Exception:
        pass
    try:
        from backend.services.o1_telemetry_service import ensure_point_map_and_config

        ensure_point_map_and_config()
    except Exception as exc:
        log_event("ERROR", "startup", "O1_ENSURE_FAILED", extra={"error": str(exc)})
    try:
        from backend.services.operations_maintenance_opportunity_service import ensure_om_demo, refresh_om_sim_telemetry

        ensure_om_demo(force=True)
        refresh_om_sim_telemetry()
    except Exception as exc:
        log_event("ERROR", "startup", "OM_ENSURE_FAILED", extra={"error": str(exc)})
    try:
        from backend.ai.pipeline.bootstrap import bootstrap_pipeline

        bootstrap_pipeline(delay_seconds=float(os.getenv("HVAC_PIPELINE_BOOTSTRAP_DELAY", "25")))
    except Exception:
        pass
    yield


app = FastAPI(
    title="HVAC Optimization & Scheduling Supervisory Engine",
    description="Supervisory AI agent platform for commercial building HVAC scheduling, setpoint reset, and chiller plant staging",
    version="1.0.0",
    lifespan=lifespan,
)

_cors = os.getenv("HVAC_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allow_origins = [o.strip() for o in _cors.split(",") if o.strip()]
_cors_regex = (os.getenv("HVAC_CORS_ORIGIN_REGEX") or "").strip() or None
if os.getenv("HVAC_ENV", "development").lower() == "production":
    allow_origins = [o for o in allow_origins if o != "*"]
    if not allow_origins and not _cors_regex:
        allow_origins = ["http://localhost:3000"]

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(platform_router)
app.include_router(bms_router)
app.include_router(bms_safety_router)
app.include_router(bms_agents_router)
app.include_router(v1_router)
app.include_router(oeh_guide_router)
app.include_router(ml_router)
app.include_router(api_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(plant_control_router)
app.include_router(variable_speed_router)
app.include_router(o14_router)
app.include_router(o15_router)
app.include_router(o16_router)
app.include_router(hvac_ventilation_router)
app.include_router(hvac_om_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    del request
    detail = exc.detail
    if isinstance(detail, dict):
        code = str(detail.get("code") or "HTTP_ERROR")
        message = str(detail.get("message") or detail.get("reason") or "Request failed.")
        details = {k: v for k, v in detail.items() if k not in ("code", "message")}
        body = _error_body(code, message, exc.status_code, details or None)
    else:
        body = _error_body("HTTP_ERROR", str(detail), exc.status_code)
    return JSONResponse(status_code=exc.status_code, content=body, headers={"X-Request-ID": body["request_id"]})


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    del request
    body = _error_body("VALIDATION_ERROR", "Request validation failed.", 422, {"errors": exc.errors()})
    return JSONResponse(status_code=422, content=body, headers={"X-Request-ID": body["request_id"]})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    del request
    log_event("ERROR", "api", "UNHANDLED", extra={"error": type(exc).__name__})
    body = _error_body("INTERNAL_ERROR", "An unexpected error occurred.", 500)
    return JSONResponse(status_code=500, content=body, headers={"X-Request-ID": body["request_id"]})


@app.get("/")
async def root():
    return {
        "service": "HVAC Optimization & Scheduling Supervisory Engine",
        "status": "ok",
        "health": "/healthz",
        "docs": "/docs",
        "dashboard": "/api/platform/dashboard/home",
        "request_id": current_request_id(),
    }


@app.get("/healthz")
@app.get("/api/healthz")
@app.get("/api/health")
async def health():
    return {"status": "ok", "request_id": current_request_id()}


@app.get("/api/seed")
async def trigger_seed():
    import subprocess
    subprocess.Popen(["python", "super_seeder.py"])
    return {"status": "Seeding started in the background! Check the UI in 1-2 minutes."}


@app.get("/readyz")
@app.get("/api/readyz")
@app.get("/api/ready")
async def ready():
    from backend.workers.watchdog import ai_watchdog_status, watchdog_status
    from backend.bms.connection_manager import get_connection_manager
    from backend.services.canonical_telemetry_service import latest_points
    from backend.services.hvac_safety_contract import is_safe_mode
    from backend.services.edge_mode import edge_status
    from database.session import alembic_head_ok

    db_ok = database_ok()
    wd = watchdog_status()
    ai = ai_watchdog_status()
    try:
        points = latest_points(limit=1)
    except Exception:
        points = []
    tel_ok = True
    if points:
        tel_ok = points[0].get("classified") in ("LIVE", "SIMULATED", "STALE", "BAD", "MISSING")
    connected = get_connection_manager().is_production_connected()
    checks = {
        "database": "OK" if db_ok else "FAIL",
        "worker": "OK" if wd.get("alive") else "STALE",
        "bms": "CONNECTED" if connected else "DISCONNECTED",
        "telemetry": "OK" if tel_ok else "FAIL",
        "migrations": "OK" if alembic_head_ok() else "DRIFT",
        "safeMode": is_safe_mode(),
        "watchdog": wd,
        "ai_watchdogs": ai,
        "edge": edge_status(),
    }
    ready_flag = db_ok
    return {
        "status": "READY" if ready_flag else "NOT_READY",
        **checks,
        "request_id": current_request_id(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
