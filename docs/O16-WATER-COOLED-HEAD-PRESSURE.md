# O16 — Variable Head Pressure Control (Water-Cooled Condensers)

## 1. Objective

Minimize condenser-water pumping energy at part load while holding required condensing/head pressure and the compressor operating envelope.

Canonical UI: `/agents/variable-speed/water-cooled-head-pressure`  
Legacy `/agents/variable-speed/variable-head-pressure-water-cooled` redirects here.

Canonical API: `/api/agents/variable-speed/o16`

No application login.

## 2. Engineering principle

### SOURCE-GUIDE REQUIREMENTS

NSW OEH / AIRAH *I am your optimisation guide: HVAC systems* (OEH 2015/0317), Opportunity 16 (printed pp. 74–77):

- At lower ambient, load typically falls and condenser capacity rises; condensing pressure can be reduced.
- Maintain condensing pressure with a **constant or, better, floating** setpoint by modulating heat rejection:
  1. **Single** water-cooled DX unit: **VSD on the CW pump**.
  2. **Multiple** DX units on **one CW pump**: **CW modulating head-pressure valves**.
- Isolate CW to units that are off (2-port) so a shared pump does not circulate unused flow.
- **Over-condensing** (excess CW) drops condensing temperature/pressure and harms the vapour-compression cycle. **Under-condensing** risks trips.
- Typical potential: **10–30% CW-pump energy**. This is **not** verified savings for a given building.
- Minimum information: head-pressure setpoint, heat-rejection control strategy, refrigerant type.
- Manufacturer advice is required (especially isolation retrofits).

### IMPLEMENTATION DETAILS

- Supervisory write: `CW.PumpSpeed` (VSD) or `CW.ValvePosition` (shared-pump valves).
- Affinity-law predicted pump power (guide Appendix D) is labeled **PREDICTED** only.
- Shared-pump sites do not independently stop the CW pump for one unit.

### CONFIGURABLE PARAMETERS

The guide does **not** give a numeric psig envelope, CEWT formula, pump trim, or deadband.

| Parameter | Default | Label |
|---|---|---|
| `control_strategy` | VSD_PUMP | SOURCE-GUIDE choice |
| `target_head_pressure` | null | CONFIGURABLE (must be set before trim) |
| `target_condensing_temp_c` | null | CONFIGURABLE |
| min/max HP, Tcond, flow, pump, valve | null | CONFIGURABLE |
| `pump_trim_pct` / `valve_trim_pct` | 2 | CONFIGURABLE_DEFAULT |
| `high_load_pct` | 90 | CONFIGURABLE_DEFAULT |
| `control_mode` | ADVISORY | IMPLEMENTATION |

### ASSUMPTIONS / MISSING DATA

No invented CEWT 27/29°C reset. Without a configured HP/Tcond target the engine **HOLDs**.

## 3. Required telemetry

Aliases: `CW.SupplyTemp` (CEWT), `CW.ReturnTemp` (CLWT), `CW.HeadPressure`, `CW.CondTemp`, `CW.Flow`, `CW.PumpSpeed`, `CW.PumpPower`, `CW.ValvePosition`, `CW.Load`, `CW.CoolingCall`, `CW.CompressorState`, `CW.Alarm`, `CW.WetBulb`.

LIVE requires GOOD quality and non-simulation source.

## 4. Equipment

Water-cooled DX condenser, CW pump, CW control valve, cooling tower / heat rejection — from the equipment registry (not hardcoded).

## 5. Control strategy

Configured: FIXED_HEAD_PRESSURE, FLOATING_HEAD_PRESSURE, VSD_PUMP, VALVE, COORDINATED.

## 6. Optimization algorithm

`backend/agents/official_opportunities/o16_water_cooled_hp.py` (`ENGINE_VERSION = o16-wc-hp-1.0`).

1. Build state (ΔT, load ratio, HP margin).
2. If unit off + valve strategy → isolate valve.
3. If high load → HOLD (do not reduce heat rejection).
4. If HP below configured min → BLOCKED (over-condensing protection).
5. If HP above configured target → reduce pump speed or close valve by trim.
6. Enforce configured envelopes and rate-of-change.
7. Predict pump kW via N³ affinity if pump kW and speed exist.

## 7. Safety gates

Shared `evaluate_dispatch` plus O16 engineering gates (telemetry, quality, freshness, BMS, not SIMULATION, SAFE_MODE, HP, flow, pump/valve range, rate-of-change, alarms, conflicts, idempotency). Frontend does not compute safety.

## 8–10. Command / verify / rollback

Statuses on shared `control_commands`. Apply uses BMS gateway. Verify reads telemetry. Failed verify attempts safe rollback; if BMS/SAFE_MODE blocks rollback, status `ROLLBACK_REQUIRED`.

## 11. Database

Alembic `0013_o16_water_cooled_hp`: `o16_config`, `o16_telemetry`, `o16_state`, `o16_recommendations`, `o16_verification`, `o16_savings`. Commands/audit remain shared platform tables.

## 12. API

`/api/agents/variable-speed/o16` — dashboard, telemetry, recommendation, optimize, commands (+ approve/apply/verify/rollback), history, health, equipment, safety, config, safe-mode.

Errors: `{ code, message, request_id }`.

## 13. Frontend

`frontend/components/hvac/variable-speed/o16/WaterCooledHeadPressureDashboard.tsx` via React Query (`useO16Dashboard`) and `frontend/lib/api/client.ts`.

## 14. M&V

Predicted / applied / verified are separate. Guide 10–30% is opportunity potential only.

## 15. Simulation vs production

SIMULATION is never LIVE. Default ADVISORY. No BMS → read-only.

## 16. Troubleshooting

NO DATA: ingest `CW.*` LIVE_BMS GOOD points. HOLD without target: POST `/config` with `target_head_pressure`. APPLY 409 ADVISORY_ONLY: expected until mode is AUTO/APPROVAL_REQUIRED and BMS is connected.
