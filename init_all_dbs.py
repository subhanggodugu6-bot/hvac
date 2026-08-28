import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if os.getenv("HVAC_ENV", "development").lower() == "production":
    raise SystemExit("Refusing to run init_all_dbs.py in production.")
if os.getenv("HVAC_ALLOW_DB_RESET", "0") not in ("1", "true", "TRUE"):
    raise SystemExit("Set HVAC_ALLOW_DB_RESET=1 and HVAC_ENV=development to reset local SQLite.")

import sqlite3

from database.session import init_db

for db_path in [
    os.path.join(os.path.dirname(__file__), "database", "hvac_supervisory.db"),
    os.path.join(os.path.dirname(__file__), "backend", "database", "hvac_supervisory.db"),
]:
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("DROP TABLE IF EXISTS historical_thermal_response")
        tables = c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'plant_control_%'"
        ).fetchall()
        for (t,) in tables:
            c.execute(f"DROP TABLE IF EXISTS {t}")
        conn.commit()
        conn.close()

init_db()
from database.seed.seed_data import seed_database
try:
    seed_database()
except Exception as e:
    print(f"Seed skipped or failed: {e}")
print("SUCCESS: Tables recreated cleanly!")
