# Hugging Face Space: FastAPI + O1–O20 agents only (no Next.js UI).
# UI is deployed on Vercel.

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 user

ENV HOME=/home/user
WORKDIR /home/user/app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY --chown=user:user backend backend
COPY --chown=user:user database database
COPY --chown=user:user alembic alembic
COPY --chown=user:user alembic.ini alembic.ini

RUN mkdir -p database && chown -R user:user /home/user/app

USER user

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/home/user/app:/home/user/app/backend
ENV PATH=/home/user/.local/bin:$PATH
ENV HVAC_ENV=development
ENV HVAC_DEPLOYMENT_MODE=demo
ENV HVAC_BMS_MODE=simulation
ENV HVAC_USE_SIMULATION=1
ENV HVAC_PLANT_MODE_PERSIST=1
ENV HVAC_BMS_WRITE_ENABLED=0
ENV HVAC_ALLOW_SIM_WRITES=0
ENV HVAC_ALLOW_CREATE_ALL=1
ENV HVAC_START_CONTROL_WORKER=1
ENV HVAC_SAFE_MODE=0
ENV HVAC_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ENV HVAC_CORS_ORIGIN_REGEX=https://.*\.(vercel\.app|onrender\.com)
ENV PORT=7860

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -sf http://127.0.0.1:7860/healthz || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
