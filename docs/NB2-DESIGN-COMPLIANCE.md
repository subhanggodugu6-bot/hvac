# NB2 AI Gateway — Design Compliance Report

**Reference:** `NB2_AI_Gateway_BMS_Design_Document.pdf`  
**Product:** HVAC repo — edge BMS gateway + self-learning pipeline  
**Pipeline (design):** `BMS Data → RLS → LSTM → Safe RL → Rule Engine → BMS Control → Feedback → RLS`  
**Operating principle:** Sense → Learn → Predict → Optimize → Validate → Control → Learn  

**Assessment date:** 2026-09-01  
**Overall verdict:** **Phase 3–4 compliant with gaps** — core loop is implemented and tested; full production gateway (all protocols, full plant, fleet/cloud) is **partial**.

---

## 1. Executive summary

| Design intent | Status | Notes |
|---|---|---|
| Continuous learning from building data | **Working** | RLS ticks + post-verify feedback |
| LSTM prediction of future state | **Partial** | Works when torch + trained models; optional |
| Safe RL optimization | **Working** | Recommend-only; 9 discrete actions |
| Rule Engine safety gate | **Working** | R01–R10 + dispatch contract |
| BMS control after approval | **Partial** | Stage G one-point; sim auto-dispatch |
| Edge without cloud | **Partial** | Edge compose profile; cloud optional |
| Closed-loop feedback | **Working** | Verify → RLS feedback + Safe RL reward |
| AI Orchestrator | **Working** | `backend/ai/pipeline/orchestrator.py` |
| Traceability / historian | **Partial** | DB tables exist; not full PDF schema |

**Implementation phase (PDF §15):**

| Phase | Design | Current |
|---|---|---|
| **1 Monitor** | BMS → Data → RLS | **Done** (sim + live lab BACnet) |
| **2 Predict** | + LSTM | **Done** (optional torch) |
| **3 Recommend** | + Safe RL, no writes | **Done** |
| **4 Controlled automation** | + Rules → BMS | **Partial** (supervised; one allowlist point) |
| **5 Continuous optimization** | Full closed loop | **Partial** (sim default; live writes off) |

---

## 2. Core pipeline — arrow-by-arrow

```
BMS Real-Time Data → RLS → LSTM → Safe RL → Rule Engine → BMS Control → Building Response → RLS
```

| Arrow | Design | Status | Evidence |
|---|---|---|---|
| **BMS → Normalized data** | Layer 1 | **Working** | `ai_normalized_telemetry.py`, `canonical_telemetry`, sim feed |
| **Normalized → RLS** | Layer 2 | **Working** | `ai/rls/runner.py`, `update_from_records` |
| **RLS → LSTM** | Layers 2→3 | **Working** | `rls/features_export.py` — 6 RLS cols in LSTM matrix |
| **LSTM → Safe RL** | Layers 3→4 | **Working** | `safe_rl/state.py` loads forecast; scorer uses it |
| **Safe RL → Rule Engine** | Layers 4→5 | **Working** | `safe_rl/service.py` `rule_engine_evaluate` on RECOMMEND |
| **Rule Engine → BMS Control** | Layers 5→6 | **Partial** | Gated apply/write; not all points; operator approve on live |
| **BMS → Feedback → RLS** | §10 closed loop | **Working** | `verification.py` → `rls/feedback.py`, Safe RL outcome |
| **Full auto E2E** | Phase 5 | **Partial** | Sim auto-dispatch; live requires explicit enable + mapping |

**Orchestrator entry points:**
- `run_pipeline_cycle()` — full cycle
- `POST /api/platform/ai/pipeline/run`
- `ai_pipeline_worker` + `job_worker`
- UI: `/ml`, `/agents` (`PipelineStatusCard`)

---

## 3. Layer compliance (PDF §4–§9)

### Layer 1 — BMS Data Acquisition (§4)

| Requirement | Status | Gap |
|---|---|---|
| Real-time BACnet | **Working** | Lab/production path; default **simulation** |
| Modbus | **Partial** | `modbus_gateway.py` — needs commissioned map |
| MQTT | **Partial** | `mqtt_gateway.py` — needs topic map |
| KNX | **Missing** | Not implemented |
| Normalized record fields | **Partial** | See table below |
| Weather / energy price | **Partial** | Weather yes; **energy price** only TOU env for Safe RL, not in normalized row |
| Data quality / validation | **Working** | GOOD/STALE/BAD/MISSING; never coerce missing to 0 |

**Normalized fields (design vs code):**

| Design field | In `build_ai_records` | In LSTM features |
|---|---|---|
| Timestamp | Yes | Yes |
| Zone_ID | Yes (param) | Via zone maps |
| Outdoor_Temp | Yes | Yes |
| Indoor_Temp | Yes | Yes |
| Humidity | Yes (optional) | **No** — not in LSTM `FEATURE_COLS` |
| Occupancy | Yes | Yes |
| Setpoint | Yes | Yes |
| Fan_Speed | Yes | Yes |
| HVAC_Power | Yes | Yes |
| Equipment_Status | Yes | Yes |
| Return/supply air temps | **No** | Separate O* engines only |
| Valve position / compressor detail | **No** | Plant engines only |
| kWh meter separate from kW | **No** | Power used as proxy |

---

### Layer 2 — RLS Online Learning (§5)

| Requirement | Status | Gap |
|---|---|---|
| Predict → error → update θ | **Working** | `ai/rls/engine.py`, `service.py` |
| Thermal response model | **Working** | `zone_thermal` |
| HVAC power baseline | **Working** | `hvac_power` |
| Energy baseline (separate) | **Missing** | Not a third RLS model |
| Equipment behavior model | **Missing** | Only via `Equipment_Status` feature |
| LIVE vs SIM split | **Working** | `source_mode` in RLS state |
| Never writes setpoints | **Working** | Enforced in tests |

---

### Layer 3 — LSTM Prediction (§6)

| Requirement | Status | Gap |
|---|---|---|
| Multi-horizon forecast (15–60 min) | **Working** | `HORIZONS_MIN` |
| Zone temperature | **Working** | `zone_temp` target |
| Energy / HVAC load | **Working** | `hvac_power`, `energy` |
| Occupancy trend | **Partial** | Target exists; training optional |
| Chiller load (separate) | **Missing** | Not an LSTM head |
| RLS = adapt, LSTM = predict | **Working** | RLS features fed into LSTM; roles separated |
| Requires PyTorch | **Partial** | Optional; template/heuristic fallback in Safe RL |

---

### Layer 4 — Safe RL Optimizer (§7)

| Requirement | Status | Gap |
|---|---|---|
| Uses RLS + LSTM + state | **Working** | `build_decision_state` |
| Occupancy | **Working** | Normalized row + constraints |
| Energy price | **Partial** | `HVAC_TOU_TARIFF_USD_KWH` — not live tariff API |
| Comfort requirements | **Working** | `HVAC_COMFORT_MIN/MAX_C` |
| Equipment constraints | **Working** | `constraints.py`, engineering limits |
| Minimize energy + comfort + equipment | **Working** | Weighted scorer |
| **Does not directly command equipment** | **Working** | PROPOSED only; tests enforce |
| Evaluates alternative setpoints | **Partial** | 9 discrete actions, not continuous SP search |
| Hotel scenario (full plant) | **Partial** | Actions map to O2/O3/O5/O7/O14/O16 — not full chiller fleet |

---

### Layer 5 — Rule & Safety Engine (§8)

| Requirement | Status | Rule |
|---|---|---|
| Comfort range | **Working** | R04 |
| Occupancy | **Working** | R05 |
| Equipment limits | **Working** | R06 |
| Operating schedule | **Working** | R07 |
| Compressor min ON/OFF | **Working** | R08 (needs runtime context) |
| Max setpoint change / rate limit | **Working** | R09 |
| Manual override / emergency | **Working** | R01–R03, safe mode |
| AI recommends, rules authorize | **Working** | Double gate: recommend + apply |
| Audit trail | **Working** | `control_audit_logs`, rules audit API |

---

### Layer 6 — BMS Control (§9)

| Requirement | Status | Gap |
|---|---|---|
| BACnet write | **Working** | Lab gateway + Stage G |
| Modbus / KNX write | **Partial / Missing** | Adapters exist; writes need maps; **no KNX** |
| Approved command only | **Working** | APPROVED → apply |
| Measure response → feedback | **Working** | Verify + RLS feedback |
| Full plant setpoints | **Missing** | Default allowlist: `ZONE-01.cooling_setpoint` only |

---

## 4. Closed-loop learning (§10)

| Feedback path | Status |
|---|---|
| Verified write → RLS update | **Working** |
| Safe RL realized reward / offline weights | **Working** |
| LSTM retrain on historian | **Partial** | Job worker / periodic; needs torch |
| Seasonal / degradation adaptation | **Partial** | RLS continuous; LSTM retrain daily default |

---

## 5. Gateway software components (§11)

| Component | Design | Status | Location |
|---|---|---|---|
| AI Orchestrator | Required | **Working** | `ai/pipeline/orchestrator.py` |
| RLS / Online Learning | Required | **Working** | `ai/rls/` |
| LSTM Inference | Required | **Partial** | `ai/lstm/infer.py` |
| Safe RL Inference | Required | **Working** | `ai/safe_rl/` |
| Rule / Safety Engine | Required | **Working** | `rules/` |
| Feature Engineering | Required | **Working** | `ai_normalized_telemetry`, `rls/features_export` |
| Time-Series Buffer | Required | **Working** | `timeseries_buffer`, Stage B APIs |
| Model Manager | Required | **Partial** | `ml_model_registry`, LSTM versioning |
| Data Quality / Validation | Required | **Working** | Quality ranks, stale seconds |
| BACnet | Required | **Working** | `bms/` lab + production path |
| Modbus | Required | **Partial** | Gateway stub |
| KNX | Required | **Missing** | — |
| MQTT | Optional in PDF list | **Partial** | Gateway stub |
| Local DB / Historian | Required | **Working** | PostgreSQL/SQLite + `canonical_telemetry` |
| LLM operator narrative | Not in PDF | **Extra** | `ai/llm/` Gemini — narrative only |

---

## 6. Data storage (§12)

| Record type | Status | Store |
|---|---|---|
| Recent sensor history | **Working** | `canonical_telemetry`, ring buffer |
| RLS parameters | **Working** | `rls_model_state`, platform_settings |
| Model versions | **Working** | `ml_model_registry`, LSTM pickles |
| Predictions | **Working** | `ml_predictions` |
| RL decisions | **Working** | `safe_rl_decisions` |
| Rule decisions | **Working** | `control_audit_logs` |
| Command outcomes | **Working** | `control_commands` lifecycle |

---

## 7. Cloud vs Gateway (§13)

| Function | Gateway (design) | This repo |
|---|---|---|
| BMS protocols | Yes | **Yes** (BACnet primary; Modbus/MQTT partial) |
| RLS on edge | Yes | **Yes** |
| LSTM on edge | Yes | **Yes** (optional torch) |
| Safe RL on edge | Yes | **Yes** |
| Rules + BMS control | Yes | **Yes** (supervised) |
| Large-scale training | Cloud optional | **Partial** — local retrain only |
| Fleet learning | Cloud optional | **Missing** |
| Long-term analytics | Cloud optional | **Partial** — retention worker |
| Model distribution | Both | **Partial** — registry only |
| Cloud optional / edge-down | Yes | **Yes** — `edge_mode`, `HVAC_CLOUD_URL` |

---

## 8. Example hotel scenario (§14) — traceability

| Step | Design | Can run today? |
|---|---|---|
| BMS: OAT, indoor, occ, kW | Yes | **Yes** (sim or mapped live) |
| RLS learns response | Yes | **Yes** |
| LSTM predicts demand rise | Yes | **If model trained** |
| Safe RL picks strategy | Yes | **Yes** |
| Rule Engine APPROVED | Yes | **Yes** |
| BACnet command | Yes | **Sim/lab yes; live gated** |
| Feedback to RLS | Yes | **Yes** after verify |

---

## 9. What's still missing (prioritized)

### P0 — Production gateway gaps
1. **KNX protocol** — not implemented (PDF §3, §11).
2. **Full plant write surface** — Stage G one point; design implies AHU/FCU/chiller setpoints.
3. **Live default** — `HVAC_BMS_MODE=simulation`; hotel scenario assumes real BMS.

### P1 — Model / feature gaps
4. **Humidity in LSTM** — normalized but not a training feature.
5. **RLS energy baseline model** — PDF lists separate from HVAC power; code has 2 models only.
6. **Chiller load LSTM head** — not separate from HVAC power.
7. **Continuous setpoint search** — Safe RL uses discrete actions, not full optimization surface.

### P2 — Operations / scale
8. **Fleet learning / cloud training** — not implemented.
9. **Dynamic energy pricing** — static TOU env only.
10. **Modbus/MQTT commissioned maps** — code exists; site mapping required.
11. **Phase 5 unattended live automation** — intentionally blocked without operator + write enable.

### P3 — Documentation / UX (addressed in repo)
- Compliance doc (this file)
- `/ml` pipeline + LLM explain
- `/agents` pipeline heartbeat
- CI includes `test_ai_pipeline.py`

---

## 10. Verification checklist

Run with API up (`uvicorn backend.main:app` or `docker compose up api`).

| # | Check | Command / UI | Pass criteria |
|---|---|---|---|
| 1 | Normalized data | `GET /api/platform/ai/normalized?zone_id=ZONE-01&t0=...&t1=...` | Rows with GOOD/STALE; nulls not zero |
| 2 | RLS learning | `GET /api/platform/ai/rls/status` | Models with n_updates > 0 after sim run |
| 3 | LSTM forecast | `GET /api/platform/ai/lstm/forecast` | Horizons 15–60 or TORCH_REQUIRED |
| 4 | Safe RL recommend | `POST /api/platform/ai/safe-rl/recommend` | status PROPOSED/BLOCKED; wrote_setpoints false |
| 5 | Rule Engine | `POST /api/platform/rules/evaluate` | APPROVED/REJECTED + checks |
| 6 | Full pipeline | `POST /api/platform/ai/pipeline/run` | stages.rls, .lstm, .safe_rl present |
| 7 | Pipeline worker | `GET /api/platform/ai/pipeline/status` | worker_running true after start |
| 8 | BMS write (sim) | Approve → apply Stage G command | verify OK; RLS feedback |
| 9 | Closed loop | After verify | RLS error ring / post-verify tick |
| 10 | LLM explain | `POST /api/platform/ai/llm/explain` | explanation text (Gemini or template) |
| 11 | Edge status | `GET /api/platform/edge/status` | local_loop_ok |
| 12 | Watchdogs | `GET /api/readyz` | ai_watchdogs rls/lstm/safe_rl/ai_pipeline |

**Automated tests:**  
`python -m pytest backend/tests/test_stage_c_rls.py backend/tests/test_stage_d_lstm.py backend/tests/test_stage_e_safe_rl.py backend/tests/test_stage_f_rules.py backend/tests/test_stage_g_writes.py backend/tests/test_stage_h_closed_loop.py backend/tests/test_ai_pipeline.py -q`

---

## 11. Final compliance statement

The repo **implements the NB2 design architecture** for the core loop:

**Sense → Learn (RLS) → Predict (LSTM) → Optimize (Safe RL) → Validate (Rules) → Control (BMS) → Learn**

It matches **PDF Phases 1–3 fully** and **Phase 4 partially** (supervised, allowlisted, simulation-friendly). It does **not yet** match the full production gateway vision for **all BMS protocols (KNX)**, **full-equipment control**, or **cloud fleet learning**.

**LLM (Gemini)** is an **add-on operator narrative** — not in the PDF — and does not participate in optimization or writes.

---

## 12. Recommended next steps to reach PDF Phase 5

1. Commission live BACnet point map for target hotel/plant zones.
2. Expand `HVAC_STAGE_G_WRITABLE_POINTS` after verify_stats `expand_ready`.
3. Add **Humidity** to LSTM `FEATURE_COLS` + retrain.
4. Implement **KNX** adapter or document BACnet-only deployment.
5. Add RLS **energy_baseline** third model (PDF §5).
6. Optional: cloud fleet training service (PDF §13).

---

*Generated from codebase audit against NB2_AI_Gateway_BMS_Design_Document.pdf.*
