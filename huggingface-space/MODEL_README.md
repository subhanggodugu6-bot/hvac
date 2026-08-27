---
license: apache-2.0
tags:
- hvac
- fastapi
- agents
pipeline_tag: other
---

# HVAC agents API (legacy Space packaging)

FastAPI backend and **O1–O20** supervisory agents (simulation BMS, writes disabled). **No frontend.**

## Canonical demo host (use this)

| Piece | Host |
| --- | --- |
| Source | GitHub [`subhanggodugu6-bot/hvac`](https://github.com/subhanggodugu6-bot/hvac) |
| API | Render Blueprint `hvac-api` (`render.yaml`) |
| UI | Netlify (`netlify.toml`) |

Do **not** point Netlify at a Hugging Face Space URL. Use the Render service URL:

```
HVAC_API_ORIGIN=https://hvac-api.onrender.com
NEXT_PUBLIC_API_URL=https://hvac-api.onrender.com/api
```

## Run locally

```bash
pip install -r backend/requirements.txt
set PYTHONPATH=.
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The Docker files under `huggingface-space/` are retained only for optional offline packaging. They are **not** part of the hosted demo.
