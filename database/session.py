import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_PATH = os.path.join(os.path.dirname(__file__), "hvac_supervisory.db")
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("HVAC_DATABASE_URL") or f"sqlite:///{DB_PATH}"

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
_engine_kwargs: dict = {"connect_args": _connect_args, "pool_pre_ping": True}
if not DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update(
        pool_size=int(os.getenv("HVAC_DB_POOL_SIZE", "10")),
        max_overflow=int(os.getenv("HVAC_DB_MAX_OVERFLOW", "20")),
        pool_recycle=int(os.getenv("HVAC_DB_POOL_RECYCLE", "1800")),
    )
engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _allow_create_all() -> bool:
    explicit = os.environ.get("HVAC_ALLOW_CREATE_ALL")
    if explicit is not None:
        return explicit.lower() in ("1", "true", "yes")
    return os.getenv("HVAC_ENV", "development").lower() != "production"


def _run_alembic() -> None:
    try:
        from alembic.config import Config
        from alembic import command

        root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        cfg = Config(os.path.join(root, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(root, "alembic"))
        cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
        command.upgrade(cfg, "head")
    except Exception as exc:
        print(f"[alembic] upgrade skipped or failed: {exc}")


def init_db():
    from database.models import Base
    try:
        import database.models_o1  # noqa: F401
    except Exception:
        pass
    try:
        import database.models_ml  # noqa: F401
    except Exception:
        pass

    _run_alembic()
    if _allow_create_all():
        Base.metadata.create_all(bind=engine)
    try:
        from backend.bms.simulation_telemetry import reset_hydration_state

        reset_hydration_state()
    except Exception:
        pass
    try:
        from backend.services.o1_telemetry_service import ensure_point_map_and_config
        ensure_point_map_and_config()
    except Exception as exc:
        print(f"[o1] point map init skipped: {exc}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_ok() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def alembic_head_ok() -> bool:
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext

        root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        cfg = Config(os.path.join(root, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(root, "alembic"))
        script = ScriptDirectory.from_config(cfg)
        heads = set(script.get_heads())
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current = set(context.get_current_heads())
        return bool(current) and current.issubset(heads)
    except Exception:
        return True
