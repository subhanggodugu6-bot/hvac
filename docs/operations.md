# HVAC data operations

## Local development
SQLite file: `database/hvac_supervisory.db`

Backup:
```
copy database\hvac_supervisory.db database\hvac_supervisory.backup.db
```

Restore:
```
copy database\hvac_supervisory.backup.db database\hvac_supervisory.db
```

Schema changes: Alembic only (`alembic upgrade head`). Set `HVAC_ALLOW_CREATE_ALL=0` in production.

O16 water-cooled head pressure: `docs/O16-WATER-COOLED-HEAD-PRESSURE.md`. Canonical UI `/agents/variable-speed/water-cooled-head-pressure`. API `/api/agents/variable-speed/o16`.

## Production target
PostgreSQL + TimescaleDB for `canonical_telemetry` hypertables keyed by `(building_id, point_id, timestamp)`.

Retention: `backend/workers/retention_worker.py` counts aged rows. Physical purge requires `HVAC_TELEMETRY_PURGE=1`.

Do not drop `om_*`, ventilation, scheduling, plant-control, or VFD tables.
