---
title: HVAC Agents API
emoji: "hvac"
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
startup_duration_timeout: 1h
pinned: false
short_description: FastAPI O1-O20 HVAC agents (simulation, writes off)
---

# HVAC agents API (not the live demo host)

**Canonical hosting:** GitHub [`subhanggodugu6-bot/hvac`](https://github.com/subhanggodugu6-bot/hvac) → **Render** API → **Netlify** UI.

This Space packaging is optional/legacy. Prefer the Render Blueprint in the repo root (`render.yaml`).

| Setting | Value |
| --- | --- |
| `HVAC_BMS_MODE` | `simulation` |
| `HVAC_USE_SIMULATION` | `1` (Dataset feeder) |
| `HVAC_BMS_WRITE_ENABLED` | `0` |
| `HVAC_ALLOW_SIM_WRITES` | `0` |

Netlify env (point at Render, not HF):

```
HVAC_API_ORIGIN=https://hvac-api.onrender.com
NEXT_PUBLIC_API_URL=https://hvac-api.onrender.com/api
```
