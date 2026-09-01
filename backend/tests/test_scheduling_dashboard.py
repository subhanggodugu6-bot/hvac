"""Scheduling dashboard aggregated O1–O4 contract."""
import os
import sys
import unittest
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from database.session import init_db
from backend.services.scheduling_dashboard_service import (
    get_scheduling_dashboard,
    _freshness,
    _display_state,
    _data_state,
    _card,
)
from backend.services.o1_telemetry_service import ingest_samples, ensure_point_map_and_config


class TestFreshness(unittest.TestCase):
    def test_bands(self):
        self.assertEqual(_freshness(2), "LIVE")
        self.assertEqual(_freshness(45), "STALE")
        self.assertEqual(_freshness(200), "DEGRADED")
        self.assertEqual(_freshness(400), "OFFLINE")
        self.assertEqual(_freshness(None), "OFFLINE")

    def test_display_states(self):
        self.assertEqual(_display_state("LIVE", True, True, None), "LIVE")
        self.assertEqual(_display_state("STALE", True, True, None), "STALE TELEMETRY")
        self.assertEqual(_display_state("OFFLINE", False, True, None), "AWAITING TELEMETRY")
        self.assertEqual(_display_state("LIVE", True, True, "down"), "BACKEND OFFLINE")
        self.assertEqual(_display_state("LIVE", True, False, None), "ENGINE NOT CONFIGURED")


class TestDashboardAggregation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        ensure_point_map_and_config()
        ingest_samples(
            [
                {"signal": "ZONE_TEMP", "value": 24.2, "quality": "GOOD", "source": "SIMULATED", "timestamp": datetime.utcnow()},
                {"signal": "OAT", "value": 29.0, "quality": "GOOD", "source": "SIMULATED", "timestamp": datetime.utcnow()},
                {"signal": "ALARM", "value": 0, "quality": "GOOD", "source": "SIMULATED", "timestamp": datetime.utcnow()},
                {"signal": "EQUIP_AVAIL", "value": 1, "quality": "GOOD", "source": "SIMULATED", "timestamp": datetime.utcnow()},
            ],
            source="SIMULATED",
        )
        cls.dash = get_scheduling_dashboard()

    def test_shape(self):
        d = self.dash
        self.assertIn("agentHealth", d)
        self.assertIn("opportunities", d)
        self.assertEqual(len(d["opportunities"]), 4)
        ids = [o["opportunityId"] for o in d["opportunities"]]
        self.assertEqual(ids, ["O1", "O2", "O3", "O4"])

    def test_nulls_not_invented(self):
        for o in self.dash["opportunities"]:
            if o.get("confidence") is not None:
                self.assertNotEqual(o["confidence"], "94.2%")
        self.assertNotEqual(self.dash.get("verifiedSavingsKwh"), 17.8)

    def test_o1_has_traceable_source(self):
        o1 = self.dash["opportunities"][0]
        self.assertEqual(o1["opportunityId"], "O1")
        self.assertTrue(o1.get("dataSource"))
        if o1.get("currentValue"):
            self.assertNotEqual(o1["displayState"], "AWAITING TELEMETRY")

    def test_o2_o3_o4_from_engine(self):
        o2, o3, o4 = self.dash["opportunities"][1:]
        self.assertIn("ENGINE", o2.get("dataSource") or o2.get("apiError") or "")
        self.assertIn("ENGINE", o3.get("dataSource") or "")
        self.assertIn("ENGINE", o4.get("dataSource") or "")

    def test_verified_savings_only_verified(self):
        if self.dash.get("verifiedSavingsKwh") is not None:
            self.assertGreaterEqual(self.dash["verifiedSavingsKwh"], 0)

    def test_card_null_passthrough(self):
        c = _card(
            "O9", "x", status=None, telemetry_status="OFFLINE", telemetry_age=None,
            last_telemetry_at=None, current_value=None, optimized_value=None,
            energy_impact=None, last_evaluation_at=None, data_source="NONE",
        )
        self.assertIsNone(c["currentValue"])
        self.assertEqual(c["displayState"], "AWAITING TELEMETRY")


class TestStaleTelemetryCard(unittest.TestCase):
    def test_stale_ingest_age_label(self):
        ingest_samples(
            [{"signal": "ZONE_RH", "value": 40, "quality": "GOOD", "source": "SIMULATED",
              "timestamp": datetime.utcnow() - timedelta(seconds=90)}],
            source="SIMULATED",
        )
        self.assertEqual(_freshness(90), "STALE")


class TestKpiContract(unittest.TestCase):
    def test_data_state_matrix(self):
        self.assertEqual(_data_state(api_error="x", engine_ok=True, freshness="LIVE", has_live=True, has_stored=True), "ERROR")
        self.assertEqual(_data_state(api_error=None, engine_ok=False, freshness="LIVE", has_live=True, has_stored=True), "ENGINE_OFFLINE")
        self.assertEqual(_data_state(api_error=None, engine_ok=True, freshness="LIVE", has_live=True, has_stored=True), "LIVE")
        self.assertEqual(_data_state(api_error=None, engine_ok=True, freshness="STALE", has_live=False, has_stored=True), "STALE")
        self.assertEqual(_data_state(api_error=None, engine_ok=True, freshness="OFFLINE", has_live=False, has_stored=True), "LAST_KNOWN")
        self.assertEqual(_data_state(api_error=None, engine_ok=True, freshness="OFFLINE", has_live=False, has_stored=False), "AWAITING_TELEMETRY")

    def test_null_energy_and_confidence(self):
        c = _card(
            "O1", "x", status=None, telemetry_status="LIVE", telemetry_age=2,
            last_telemetry_at=None, current_value="24.2°C", optimized_value=None,
            energy_impact=None, confidence=None, last_evaluation_at=None, data_source="TEST",
            primary_metric={"label": "Optimized Start", "value": None, "unavailableReason": "no decision"},
        )
        self.assertIsNone(c["impact"]["energy"])
        self.assertIsNone(c["confidence"])
        self.assertEqual(c["dataState"], "LIVE")
        self.assertIsNone(c["primaryMetric"]["value"])

    def test_missing_timestamp_offline(self):
        c = _card(
            "O2", "x", status=None, telemetry_status="OFFLINE", telemetry_age=None,
            last_telemetry_at=None, current_value=None, optimized_value=None,
            energy_impact=None, last_evaluation_at=None, data_source="NONE",
        )
        self.assertEqual(c["dataState"], "AWAITING_TELEMETRY")
        self.assertIsNone(c["telemetry"]["ageSeconds"])


class TestDashboardKpiCards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        ensure_point_map_and_config()
        ingest_samples(
            [
                {"signal": "ZONE_TEMP", "value": 24.2, "quality": "GOOD", "source": "SIMULATED", "timestamp": datetime.utcnow()},
                {"signal": "OAT", "value": 29.0, "quality": "GOOD", "source": "SIMULATED", "timestamp": datetime.utcnow()},
            ],
            source="SIMULATED",
        )
        cls.dash = get_scheduling_dashboard()

    def test_canonical_fields(self):
        for o in self.dash["opportunities"]:
            self.assertIn("primaryMetric", o)
            self.assertIn("secondaryMetrics", o)
            self.assertIn("dataState", o)
            self.assertIn("telemetry", o)
            self.assertIn(o["dataState"], {
                "LIVE", "LAST_KNOWN", "STALE", "AWAITING_TELEMETRY", "ENGINE_OFFLINE", "ERROR",
            })
            self.assertNotEqual(o.get("displayState"), "NO LIVE DATA")

    def test_o1_not_example_hardcodes(self):
        o1 = self.dash["opportunities"][0]
        self.assertEqual(o1["opportunityId"], "O1")
        self.assertEqual((o1.get("primaryMetric") or {}).get("label"), "Optimized Start")
        self.assertTrue(o1.get("dataSource"))
        self.assertNotEqual(o1.get("confidence"), "94.2%")

    def test_o2_not_o1_values(self):
        o1, o2 = self.dash["opportunities"][0], self.dash["opportunities"][1]
        if o1.get("primaryMetric", {}).get("value") and o2.get("primaryMetric", {}).get("value"):
            self.assertNotEqual(o1["primaryMetric"]["label"], o2["primaryMetric"]["label"])

    def test_o4_runtime_not_invented(self):
        o4 = self.dash["opportunities"][3]
        self.assertIsNone(o4.get("runtimeImpact"))
        plr = next((m for m in o4.get("secondaryMetrics") or [] if m["label"] == "Plant PLR"), None)
        self.assertIsNotNone(plr)
        if plr.get("value") is None:
            self.assertTrue(plr.get("unavailableReason"))

    def test_header_kpis_not_hardcoded_verified(self):
        self.assertNotEqual(self.dash.get("verifiedSavingsKwh"), 17.8)


class TestSimVerifiedSavingsKpi(unittest.TestCase):
    def test_ensure_sim_verified_savings_fills_kpi(self):
        os.environ["HVAC_BMS_MODE"] = "simulation"
        os.environ["HVAC_USE_SIMULATION"] = "1"
        init_db()
        ensure_point_map_and_config()
        ingest_samples(
            [
                {"signal": "ZONE_TEMP", "value": 24.2, "quality": "GOOD", "source": "SIMULATION", "timestamp": datetime.utcnow()},
                {"signal": "OAT", "value": 29.0, "quality": "GOOD", "source": "SIMULATION", "timestamp": datetime.utcnow()},
                {"signal": "ALARM", "value": 0, "quality": "GOOD", "source": "SIMULATION", "timestamp": datetime.utcnow()},
                {"signal": "EQUIP_AVAIL", "value": 1, "quality": "GOOD", "source": "SIMULATION", "timestamp": datetime.utcnow()},
            ],
            source="SIMULATION",
        )
        from backend.services.scheduling_dashboard_service import ensure_sim_verified_savings, get_scheduling_dashboard
        from backend.services.ttl_cache import cache_delete

        cache_delete("sched_db_kpis")
        ensure_sim_verified_savings()
        dash = get_scheduling_dashboard()
        self.assertIsNotNone(dash.get("verifiedSavingsKwh"))
        self.assertGreater(float(dash["verifiedSavingsKwh"]), 0)
        self.assertTrue(str(dash.get("verifiedSavings") or "").endswith("kWh"))
        self.assertNotEqual(dash.get("agentHealth"), "OFFLINE")
        self.assertIn(dash.get("agentHealth"), ("OPTIMAL", "MONITORING", "DEGRADED", "STALE"))


if __name__ == "__main__":
    unittest.main()
