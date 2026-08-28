import os
import sys
from datetime import datetime, timezone

os.environ["HVAC_USE_SIMULATION"] = "1"
os.environ["HVAC_BMS_MODE"] = "simulation"
os.environ["HVAC_ALLOW_CREATE_ALL"] = "1"
os.environ["HVAC_ENV"] = "development"

from database.session import init_db, SessionLocal
from backend.bms.simulation_telemetry import hydrate_synthetic_dataset
from backend.services.dataset_persist_service import persist_dataset_modules
from backend.services.ventilation_opportunity_service import ensure_demo_telemetry
from backend.services.operations_maintenance_opportunity_service import ensure_om_demo
from backend.ml.registry.demo_seed import ensure_demo_ml_models
from backend.services.plant_control_service import plant_control_service

def run_all():
    print("1. Initializing database...")
    init_db()
    
    print("2. Hydrating synthetic canonical telemetry...")
    rows = hydrate_synthetic_dataset()
    print(f"   -> Canonical rows inserted: {rows}")
    
    print("3. Hydrating Ventilation module...")
    try: ensure_demo_telemetry(); print("   -> Ventilation OK")
    except Exception as e: print("   -> Ventilation error:", e)
    
    print("4. Hydrating Operations module...")
    try: ensure_om_demo(); print("   -> Operations OK")
    except Exception as e: print("   -> Operations error:", e)
    
    print("5. Hydrating ML Registry...")
    try: ensure_demo_ml_models(force=True); print("   -> ML Registry OK")
    except Exception as e: print("   -> ML Registry error:", e)
    
    print("6. Hydrating Plant Control module...")
    try: plant_control_service.ensure_demo_activity(); print("   -> Plant Control OK")
    except Exception as e: print("   -> Plant Control error:", e)
    
    print("7. Persisting historic datasets...")
    try: persist_dataset_modules(force=True); print("   -> Historic Persist OK")
    except Exception as e: print("   -> Historic Persist error:", e)
    
    print("All datasets generated and connected successfully!")

if __name__ == "__main__":
    run_all()
