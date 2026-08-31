# HVAC Optimization Platform

Supervisory control for commercial HVAC, covering **O1–O20** from the NSW Office of Environment and Heritage / AIRAH guide *[Optimising your heating, ventilation and air conditioning systems](https://www.environment.nsw.gov.au/)*. The app evaluates live (or simulated) plant telemetry, proposes setpoints and schedules, and — only when every safety gate passes — can write to a BMS.

Simulation and live BMS writes are strictly separated. Missing telemetry is shown as **NO LIVE DATA** / **AWAITING TELEMETRY**. Guide “potential savings” are teaching figures, never treated as measured building savings.

| Layer | Stack |
| --- | --- |
| UI | Next.js 14, React 18, Tailwind, TanStack Query, Recharts |
| API | FastAPI 1.0 (`HVAC Optimization & Scheduling Supervisory Engine`) |
| Runtime | Safety → approval → apply → verify → rollback → audit |
| BMS | Simulator, BACnet, MQTT, REST, Modbus |
| Data | SQLite (local) or PostgreSQL / TimescaleDB (Docker & production) |
| ML | scikit-learn pipelines for thermal response, plant, and VFD models |

There is **no application login**. Opening `/` redirects to `/overview`. Production access is network and infrastructure, not JWT or sessions.

## Canonical hosting (only)

| Piece | Host | Notes |
| --- | --- | --- |
| Source | GitHub [`subhanggodugu6-bot/hvac`](https://github.com/subhanggodugu6-bot/hvac) | Sole remote / CI source |
| API | [Render](https://dashboard.render.com) Blueprint `hvac-api` (`render.yaml`) | Docker, auto-deploy on `main` |
| UI | [Netlify](https://app.netlify.com) (`netlify.toml`, `base = frontend`) | Next.js via `@netlify/plugin-nextjs` |

**Do not use** Vercel, Hugging Face Spaces, or any other GitHub account/repo for this demo. Old Vercel projects and the previous GitHub remote are retired.

```bash
gh repo clone subhanggodugu6-bot/hvac
cd hvac
```

---

## Architecture

```
Next.js (:3000)
    │  NEXT_PUBLIC_API_URL → http://localhost:8000/api
    ▼
FastAPI (:8000)     health: GET /healthz  ready: GET /readyz
    │
    ├─ Five agents (O1–O20)
    ├─ Control worker     python -m backend.workers.control_entrypoint
    ├─ Job worker         python -m backend.workers.job_worker   (retention / weather)
    └─ BMS gateway
           simulation  ──► in-process simulator (never reports production-connected)
           production  ──► BACnet | MQTT | REST | Modbus  (handshake required; no sim fallback)
                    ▼
         SQLite  or  TimescaleDB (+ Redis in compose)
```

Control path for a write:

**safety envelope → operational approval → apply → telemetry verify → rollback on failure → audit log**

`HVAC_SAFE_MODE=1` blocks all automatic writes. Approval is an operations workflow, not a login.

---

## Opportunity catalog (O1–O20)

Encoded from the OEH/AIRAH guide (catalog lives in `backend/services/official_catalog.py`; teaching copy in `backend/knowledge/hvac_guide_catalog.py`). The PDF is **not** read at runtime.

### Scheduling

| ID | Opportunity | UI |
| --- | --- | --- |
| O1 | Optimum start / stop | `/agents/scheduling/optimum-start-stop` |
| O2 | Space temperature setpoints & control bands | `/agents/scheduling/space-temperature` |
| O3 | Master AHU supply-air temperature | `/agents/scheduling/master-ahu-sat` |
| O4 | Chiller & compressor staging | `/agents/scheduling/chiller-staging` |

### Plant control

| ID | Opportunity | UI |
| --- | --- | --- |
| O5 | Duct static pressure reset | `/agents/plant-control/duct-static-pressure` |
| O6 | Heating hot water temperature reset | `/agents/plant-control/temperature-reset?mode=HHW` |
| O7 | Chilled water temperature reset | `/agents/plant-control/temperature-reset?mode=CHW` |
| O8 | Condenser water temperature reset | `/agents/plant-control/temperature-reset?mode=CW` |
| O9 | Electronic expansion valve (advisory retrofit) | `/agents/plant-control/electronic-expansion-valve` |

### Ventilation & airflow

| ID | Opportunity | UI |
| --- | --- | --- |
| O10 | Economy cycle | `/agents/ventilation-airflow/economy-cycle` |
| O11 | Night purge | `/agents/ventilation-airflow/night-purge` |
| O12 | Demand control ventilation — CO₂ | `/agents/ventilation-airflow/demand-ventilation` |
| O13 | Demand control ventilation — CO (carparks) | `/agents/ventilation-airflow/dcv-co` |

### Variable speed

| ID | Opportunity | UI |
| --- | --- | --- |
| O14 | Secondary chilled-water pumping | `/agents/variable-speed/chilled-water-pump` |
| O15 | Variable head pressure — air-cooled | `/agents/variable-speed/air-cooled-head-pressure` |
| O16 | Variable head pressure — water-cooled | `/agents/variable-speed/water-cooled-head-pressure` |

### Operations & maintenance

| ID | Opportunity | Kind | UI |
| --- | --- | --- | --- |
| O17 | Energy management planning | Advisory | `/agents/operations-maintenance/energy-management-planning` |
| O18 | Training & awareness | Advisory only | `/agents/operations-maintenance/training-awareness` |
| O19 | Energy-efficiency maintenance | Work-order only | `/agents/operations-maintenance/equipment-maintenance` |
| O20 | Control-software change control | Change-request only — never auto-deploys firmware or logic | `/agents/operations-maintenance/control-software` |

Platform pages: `/overview`, `/agents`, `/platform/bms`, `/platform/telemetry`, `/ml`.

---

## Safety and BMS modes

| Setting | Behaviour |
| --- | --- |
| `HVAC_BMS_MODE=simulation` | Simulator only. `is_production_connected()` is always false. |
| `HVAC_BMS_MODE=production` | Requires `HVAC_BMS_PROTOCOL=bacnet\|mqtt\|rest\|modbus`. Handshake required. **Never** falls back to the simulator. `HVAC_BMS_CONNECTED` is ignored. |
| `HVAC_BMS_WRITE_ENABLED=0` | Default. All writes return `WRITE_DISABLED` (Phase 1). |
| `HVAC_SAFE_MODE=1` | Blocks every automatic write. |

### Stage A lab BACnet (LIVE_BMS without a physical gateway)

Set plant mode to **Live BMS**, keep writes off, then:

```powershell
$env:HVAC_BMS_LAB = "1"
$env:HVAC_BMS_PROTOCOL = "bacnet"
$env:HVAC_BMS_WRITE_ENABLED = "0"
$env:PYTHONPATH = "."
python scripts/stage_a_commission.py
```

This uses the in-repo lab gateway (`LIVE_BMS` stamps — not the dataset simulator). For a real BACnet device: `HVAC_BMS_LAB=0`, `pip install -r backend/requirements-bacnet.txt`, set `HVAC_BACNET_HOST`.

A live write additionally requires: **LIVE + GOOD + FRESH** telemetry, BMS connected, engineering limits, safety contract, operating mode, and operational approval.

---

## Quick start (local, SQLite)

Requires **Python 3.12**, **Node 20**, and a clone of **this** repo:

```bash
gh repo clone subhanggodugu6-bot/hvac
cd hvac
cp .env.example .env
```

### Datasets (local)

Committed under `dataset/scheduling_supervisory/` and `data/o1/`. To regenerate and load the BMS point catalog into SQLite:

```powershell
$env:PYTHONPATH = "."
$env:HVAC_ALLOW_CREATE_ALL = "1"
python scripts/generate_hvac_datasets.py
python scripts/o1/generate_dataset.py --seed 42
python -m database.seed.seed_data
```

API (from the **repository root** so `backend.main` and imports resolve):

```bash
pip install -r backend/requirements.txt
set PYTHONPATH=.
uvicorn backend.main:app --reload --port 8000
```

On PowerShell:

```powershell
Copy-Item .env.example .env
pip install -r backend/requirements.txt
$env:PYTHONPATH = "."
uvicorn backend.main:app --reload --port 8000
```

UI:

```bash
cd frontend
npm install
npm run dev
```

| Service | URL |
| --- | --- |
| Dashboard | http://localhost:3000 → `/overview` |
| OpenAPI | http://localhost:8000/docs |
| Health | http://localhost:8000/healthz |

SQLite file: `database/hvac_supervisory.db`. Backup/restore notes are in [`docs/operations.md`](docs/operations.md).

Optional workers (same `PYTHONPATH`):

```bash
python -m backend.workers.control_entrypoint
python -m backend.workers.job_worker
```

Set `HVAC_START_CONTROL_WORKER=0` on the API process if you run the control loop as a separate process (as Docker Compose does).

---

## Hosted demo — Netlify UI + Render API

Canonical stack only: **GitHub `subhanggodugu6-bot/hvac` → Render API → Netlify UI**. Simulation BMS; production writes off (`HVAC_BMS_WRITE_ENABLED=0`).

### 1. GitHub

- Repo: https://github.com/subhanggodugu6-bot/hvac  
- Default branch: `main`  
- CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (Python 3.12 + Node 20)  
- Clone: `gh repo clone subhanggodugu6-bot/hvac`

Connect **Netlify** and **Render** to this repository only. Do not point those services at older forks or Vercel projects.

### 2. Render — FastAPI (`hvac-api`)

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Select GitHub repo `subhanggodugu6-bot/hvac`.
3. Apply [`render.yaml`](render.yaml):
   - Service name: `hvac-api`
   - Runtime: Docker (`Dockerfile` at repo root)
   - Plan: free
   - Health check: `/healthz`
   - `autoDeploy: true` on `main`
4. After first deploy, copy the public URL, e.g. `https://hvac-api.onrender.com`.
5. Confirm: `GET https://<service>.onrender.com/healthz` returns OK.

Blueprint defaults (demo-safe): `HVAC_BMS_MODE=simulation`, `HVAC_BMS_WRITE_ENABLED=0`, `HVAC_DEPLOYMENT_MODE=demo`, CORS regex allows `*.netlify.app` and `*.onrender.com`.

Optional CLI:

```bash
# after `render login`
render blueprint launch
```

### 3. Netlify — Next.js Control Center

1. Open [Netlify](https://app.netlify.com) → **Add new site** → Import from Git → `subhanggodugu6-bot/hvac`.
2. Build settings come from [`netlify.toml`](netlify.toml):
   - Base directory: `frontend`
   - Build: `npm run build`
   - Plugin: `@netlify/plugin-nextjs`
   - Node: `20`
3. Site env vars (Site settings → Environment variables), using the Render URL from step 2:

```
HVAC_API_ORIGIN=https://hvac-api.onrender.com
NEXT_PUBLIC_API_URL=https://hvac-api.onrender.com/api
```

(Replace host if Render assigned a different subdomain.)

4. Trigger a **new deploy** so `NEXT_PUBLIC_*` is baked into the client bundle. Template: [`frontend/.env.netlify.example`](frontend/.env.netlify.example).

5. Open the Netlify site URL → `/overview`. Header plant mode **DATASET** should show **SIMULATED** (never green LIVE from the dataset feeder).

### 4. Deploy automatically on push

Connecting the repo in each dashboard already gives auto-deploy (`autoDeploy: true` on
Render, Git integration on Netlify). [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
additionally kicks both services **only after CI passes on `main`**, so a red build never ships.

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
| --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | Render → `hvac-api` → Settings → Deploy Hook |
| `NETLIFY_BUILD_HOOK_URL` | Netlify → Site configuration → Build & deploy → Build hooks |

Either secret may be omitted; the workflow skips that service and still succeeds.

### 5. Smoke check

```bash
python scripts/smoke_demo.py https://hvac-api.onrender.com   # API contract
python scripts/bench_api.py  https://hvac-api.onrender.com   # endpoint latency
python scripts/smoke_routes.py https://<site>.netlify.app    # every UI route
```

### 6. What not to use

| Retired | Reason |
| --- | --- |
| Vercel (UI or API) | Replaced by Netlify + Render; remove old Vercel projects from the dashboard |
| Hugging Face Spaces | Not the demo API host; prefer Render Blueprint |
| Other GitHub accounts / forks | Sole source of truth is `subhanggodugu6-bot/hvac` |

---

## Docker Compose (local full stack)

```bash
docker compose up
```

Starts TimescaleDB, Redis, API, control worker, job worker, and the Next.js app.

| Service | Port |
| --- | --- |
| Frontend | 3000 |
| API | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |

Compose defaults: `HVAC_BMS_MODE=simulation`, `HVAC_BMS_WRITE_ENABLED=0`, `HVAC_DEPLOYMENT_MODE=local`.

---

## Configuration

Copy [`.env.example`](.env.example). Important variables:

| Variable | Default | Role |
| --- | --- | --- |
| `HVAC_ENV` | `development` | `production` tightens CORS and DB create-all |
| `HVAC_DEPLOYMENT_MODE` | `local` | Marks local / demo vs production deployment |
| `HVAC_CORS_ORIGINS` | `http://localhost:3000,...` | Allowed UI origins |
| `HVAC_CORS_ORIGIN_REGEX` | empty locally | Hosted UI hosts (`*.netlify.app`) |
| `HVAC_BMS_MODE` | `simulation` | `simulation` or `production` |
| `HVAC_BMS_PROTOCOL` | `bacnet` | `bacnet` / `mqtt` / `rest` / `modbus` |
| `HVAC_BMS_WRITE_ENABLED` | `0` | Master write switch |
| `HVAC_SAFE_MODE` | `0` | Blocks automatic writes when `1` |
| `HVAC_ALLOW_CREATE_ALL` | `0` | SQLAlchemy `create_all`; keep off in production |
| `HVAC_ALLOW_DB_RESET` | `0` | Required (with `HVAC_ENV=development`) for `init_all_dbs.py` |
| `HVAC_TELEMETRY_STALE_SECONDS` | `90` | Stale telemetry window |
| `HVAC_TELEMETRY_RETAIN_DAYS` | `90` | Retention candidate age |
| `HVAC_TELEMETRY_PURGE` | `0` | Physical purge; counts only unless `1` |
| `HVAC_DISPATCH_CONFIDENCE_MIN` | `0.65` | Minimum confidence to dispatch |
| `HVAC_START_CONTROL_WORKER` | `1` | Embed control loop in the API process |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | Browser → API |
| `OPENWEATHER_API_KEY` | empty | Optional outdoor weather |
| `FACILITY_*` | Bengaluru defaults | Display / weather location |

Production BMS hosts (`HVAC_BACNET_HOST`, `HVAC_MQTT_URL`, `HVAC_OPCUA_URL`) stay unset until a real gateway is bound.

### Database

- **Alembic is the schema authority:** `alembic upgrade head`
- Do not enable `HVAC_ALLOW_CREATE_ALL` in production
- Production target: Timescale hypertables on `canonical_telemetry` keyed by `(building_id, point_id, timestamp)` — migration `0016` creates the composite index and attempts `create_hypertable` when Timescale is available
- Retention: `backend/workers/retention_worker.py` via the job worker. Physical deletes need `HVAC_TELEMETRY_PURGE=1` (Compose `job-worker` enables purge). See [`database/RETENTION.md`](database/RETENTION.md)
- Stage B APIs: `GET /api/platform/timeseries/window`, `GET /api/platform/ai/normalized`
- Stage C RLS (online, no setpoint writes): `GET /api/platform/ai/rls/status`, `/params`, `/errors` — learning health also on `/ml`
- Stage D LSTM (advisory forecast, no setpoint writes): optional `pip install -r backend/requirements-lstm.txt`; `GET /api/platform/ai/lstm/sequence|forecast|status`, `POST /api/platform/ai/lstm/train` — chart on `/ml`
- Stage E Safe RL (NB2 Optimizer recommend, no setpoint writes): `POST /api/platform/ai/safe-rl/recommend`, `GET /api/platform/ai/safe-rl/status|decisions` — NB2 card on `/ml`; maps winner to O\* `control_commands` as PROPOSED
- Stage F Rule Engine (checklist gate): `POST /api/platform/rules/evaluate`, `GET /api/platform/rules/audit` — R01–R10 must APPROVE before `command_writer` / apply; checklist on `/ml`
- Stage G controlled writes (Level 7, one point): `GET /api/platform/bms/stage-g/status`; `POST /api/platform/commands/{id}/approve|apply` (plus existing verify/rollback). Lifecycle: Safe RL/O* **PROPOSED** → operator **APPROVED** → Rule Engine → allowlist → `command_writer` → lab/real BMS → verify → auto-rollback on fail. First point: `ZONE-01.cooling_setpoint` (`HVAC_STAGE_G_WRITABLE_POINTS`). After `verify_stats.expand_ready` (window × `HVAC_STAGE_G_VERIFY_SUCCESS_MIN`), ops may append `AHU-01.sat_setpoint` to the env allowlist — process never auto-mutates env. Recommend remains write-free. UI: `/platform/bms` Stage G panel.
- Stage H closed loop (Level 8 ≈95%): VERIFIED → lagged RLS learn (`HVAC_RLS_POST_WRITE_*`); job_worker LSTM retrain with versioned registry (`GET /api/platform/ai/lstm/models`); Safe RL realized reward + offline weight update; edge Compose profile (`docker compose --profile edge up …`) + `GET /api/platform/edge/status` cloud-down proof; per-AI watchdogs on `/readyz`. Data contract: [`docs/NB2-DATA-CONTRACT.md`](docs/NB2-DATA-CONTRACT.md). Still one-point Stage G writes; recommend never writes alone.
- Residuals closed: CI runs Stage A–H suites; `HVAC_SAFE_RL_TICK_SECONDS>0` → job_worker recommend tick; RLS error rings persist in `platform_settings`; `HVAC_LSTM_REQUIRE_TORCH`; `/ml` energy forecast toggle.

**Edge vs cloud:** Gateway runs protocols + RLS/LSTM/Safe RL infer + Rules + Stage G control (+ local job_worker retrain). Cloud URL is optional (`HVAC_CLOUD_URL`); when unreachable, local Sense→Optimize→Control continues.

---

## Tests and CI

Backend (from repo root):

```bash
pip install -r backend/requirements.txt pytest
python -m pytest backend/tests -q
```

CI currently runs: `test_p0_security`, `test_runtime_contracts`, `test_oeh_guide`, plus Stage A–H (`test_stage_a` … `test_stage_h_closed_loop`).

Frontend:

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run lint
npm run build
npx playwright test
```

GitHub Actions: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (Python 3.12, Node 20).

---

## Repository map

```
backend/           FastAPI app, agents, BMS gateways, ML, workers
  agents/          Five agents + official O1–O20 engines + runtime (safety/apply/rollback)
  api/             HTTP controllers
  bms/             Simulator and protocol gateways
  knowledge/       OEH/AIRAH catalog (pages, control kind, risks)
  ml/              Feature maps, training, prediction services
  workers/         Control loop, jobs, watchdog
frontend/          Next.js App Router dashboards
database/          Local SQLite, retention notes
docs/              Data contracts, KPI maps, opportunity audits
alembic.ini        Schema migrations
docker-compose.yml Timescale + Redis + API + workers + UI
```

---

## Documentation

| Doc | Topic |
| --- | --- |
| [`docs/operations.md`](docs/operations.md) | Local SQLite backup, Alembic, production Timescale |
| [`docs/O1-DATA-CONTRACT.md`](docs/O1-DATA-CONTRACT.md) | O1 UI ↔ API ↔ tables |
| [`docs/O1-DASHBOARD-KPI-MAPPING.md`](docs/O1-DASHBOARD-KPI-MAPPING.md) | O1 KPI mapping |
| [`docs/O10-O13-DATA-CONTRACT.md`](docs/O10-O13-DATA-CONTRACT.md) | Ventilation O10–O13 |
| [`docs/O14-OPTIMISED-SECONDARY-CHILLED-WATER-PUMPING.md`](docs/O14-OPTIMISED-SECONDARY-CHILLED-WATER-PUMPING.md) | O14 |
| [`docs/O15-VARIABLE-HEAD-PRESSURE-AIR-COOLED.md`](docs/O15-VARIABLE-HEAD-PRESSURE-AIR-COOLED.md) | O15 |
| [`docs/O16-WATER-COOLED-HEAD-PRESSURE.md`](docs/O16-WATER-COOLED-HEAD-PRESSURE.md) | O16 |
| [`docs/SCHEDULING-DASHBOARD-DATA-FLOW.md`](docs/SCHEDULING-DASHBOARD-DATA-FLOW.md) | Scheduling dashboard flow |
| [`database/RETENTION.md`](database/RETENTION.md) | Telemetry quality and retention |

---

## Design rules worth knowing

- **No invented numbers.** Charts and KPIs stay empty or labelled unavailable when the model or telemetry is not ready.
- **Simulation labels stay visible.** Demo/sim rows are not presented as live BMS.
- **O9, O17–O20 are not automatic plant control.** O18 is advisory, O19 raises work orders, O20 is change-request only.
- **API errors** include a `request_id` (`X-Request-ID`) for tracing.

---

## License and source guide

Application code is private unless a license file is added at the repo root.

Opportunity definitions and teaching copy follow **NSW Office of Environment and Heritage / AIRAH**, *Optimising your heating, ventilation and air conditioning systems* (`150317hvacguide.pdf`). Guide percentages and case-study dollars are **GUIDE_POTENTIAL** only.
