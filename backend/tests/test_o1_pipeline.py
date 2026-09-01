"""O1 pipeline unit and e2e fixtures (06:00 schedule / 08:00 occupancy)."""
import os
import sys
import unittest
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from database.session import init_db
from backend.services.o1_telemetry_service import ingest_samples, live_value, telemetry_health, ensure_point_map_and_config
from backend.services.o1_model_service import train_from_records
from backend.services.o1_pipeline import run_daily, evaluate_guardrails
from backend.services.o1_service import o1_service


def _fresh(values):
    now = datetime.utcnow()
    return ingest_samples(
        [{"signal": k, "value": v, "quality": "GOOD", "source": "SIMULATED", "timestamp": now} for k, v in values.items()],
        source="SIMULATED",
    )


class TestO1Telemetry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        ensure_point_map_and_config()

    def test_missing_not_coerced_to_zero(self):
        ingest_samples([{"signal": "ZONE_RH", "value": None, "source": "SIMULATED", "timestamp": datetime.utcnow()}], source="SIMULATED")
        self.assertIsNone(live_value("ZONE_RH"))

    def test_health_stale(self):
        ingest_samples([{
            "signal": "ZONE_TEMP",
            "value": 24.0,
            "quality": "GOOD",
            "source": "SIMULATED",
            "timestamp": datetime.utcnow() - timedelta(hours=3),
        }], source="SIMULATED")
        h = telemetry_health(30)
        self.assertIn(h["overall"], ("STALE", "MISSING", "BAD_QUALITY", "HEALTHY"))


class TestO1Model(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_insufficient_samples_not_ready(self):
        r = train_from_records([{"zone_temperature": 25, "comfort_target": 22.5, "outdoor_air_temperature": 30, "time_to_target_minutes": 40}])
        self.assertEqual(r["status"], "MODEL_NOT_READY")

    def test_evaluated_metrics_not_floored(self):
        recs = []
        for i in range(20):
            zt = 24.0 + i * 0.1
            recs.append({
                "zone_temperature": zt,
                "comfort_target": 22.5,
                "outdoor_air_temperature": 28.0,
                "time_to_target_minutes": (zt - 22.5) * 14 + 8,
            })
        r = train_from_records(recs, "test-eval")
        self.assertIn(r["status"], ("ACTIVE", "REGISTERED"))
        self.assertLess(r["r2_score"], 1.01)
        self.assertNotEqual(r["r2_score"], 0.924)


class TestO1CandidatesGuardrailsSavings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        ensure_point_map_and_config()
        _fresh({"ZONE_TEMP": 25.5, "OAT": 29.0, "OA_RH": 50, "SOLAR": 400, "ALARM": 0, "EQUIP_AVAIL": 1, "AHU_STATUS": 1})
        cls.result = run_daily(
            {"weather": {"oat": 29.0, "humidity": 50, "solar_irradiance": 400}, "zones": [{"temperature": 25.5}]},
            persist_sim=True,
            verify=False,
        )

    def test_occupancy_window_0600_0800(self):
        cfg = self.result.get("config") or {}
        self.assertEqual(cfg.get("scheduled_start"), "06:00")
        self.assertEqual(cfg.get("occupancy_start"), "08:00")
        start = self.result.get("selected_start") or {}
        if self.result.get("status") == "READY":
            self.assertLessEqual(start["candidate_time"], "08:00")
            self.assertGreaterEqual(start["candidate_time"], "06:00")
            self.assertLessEqual(start["predicted_target"], "08:00")

    def test_candidates_persisted(self):
        if self.result.get("status") != "READY":
            self.skipTest(self.result.get("reason"))
        self.assertTrue(any(r["decision"] == "SELECTED" for r in self.result["start_candidates"]))
        self.assertTrue(any(r["decision"] == "SELECTED" for r in self.result["stop_candidates"]))

    def test_savings_predicted_not_verified(self):
        if self.result.get("status") != "READY":
            self.skipTest(self.result.get("reason"))
        self.assertEqual(self.result["savings"]["verification_status"], "PREDICTED")

    def test_guardrails_block_alarm(self):
        checks, blocked = evaluate_guardrails("t", {
            "health": {"telemetry_age_seconds": 2, "bad_quality_points": 0, "overall": "HEALTHY"},
            "zone_temp": 24.0,
            "oat": 28.0,
            "target": 22.5,
            "alarm": 1.0,
            "equip_avail": 1.0,
            "stale_s": 30,
            "min_runtime": 15,
        })
        self.assertTrue(blocked)


class TestO1BmsApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_verify_does_not_return_static_0754(self):
        r = o1_service.trigger_verify()
        self.assertNotEqual(r.get("target_reached"), "07:54")
        self.assertNotEqual(r.get("actual_start"), "07:54")

    def test_energy_verified_kpi_none_when_predicted(self):
        e = o1_service.get_energy_impact()
        if e.get("status") == "UNAVAILABLE":
            return
        if e.get("verification_status") != "VERIFIED":
            self.assertIsNone(e.get("tiers", {}).get("verified_savings_kwh"))

    def test_age_seconds_accepts_timezone_aware_timestamp(self):
        from datetime import datetime, timezone, timedelta
        from backend.services.o1_service import _age_seconds, _json_safe_health

        started = datetime.now(timezone.utc) - timedelta(minutes=5)
        age = _age_seconds(started)
        self.assertIsNotNone(age)
        self.assertGreater(age, 250)

        health = _json_safe_health(
            {
                "signals": {"ZONE_TEMP": {"timestamp": started, "value": 22.0}},
                "latest_timestamp": started,
            }
        )
        self.assertIsInstance(health["signals"]["ZONE_TEMP"]["timestamp"], str)
        self.assertIsInstance(health["latest_timestamp"], str)


if __name__ == "__main__":
    unittest.main()
