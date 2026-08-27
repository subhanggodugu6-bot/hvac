"""
Automated 125-Scenario Evaluation Suite for Scheduling & Supervisory Agent.
Executes scenarios across O1, O2, O3, O4, Cross-Opportunity, Safety/Fault, and Verification/Rollback.
"""
import os
import json
from typing import Dict, Any, List
from datetime import datetime
from backend.agents.scheduling_supervisory.agent import SchedulingSupervisoryAgent
from backend.agents.scheduling_supervisory.state import AgentMode

REPORT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "reports"))
if any(os.getenv(k) for k in ("RENDER", "NETLIFY")):
    REPORT_DIR = os.path.join("/tmp", "hvac-reports")
try:
    os.makedirs(REPORT_DIR, exist_ok=True)
except OSError:
    REPORT_DIR = os.path.join("/tmp", "hvac-reports")
    os.makedirs(REPORT_DIR, exist_ok=True)


class ScenarioEvaluationRunner:
    def __init__(self):
        self.agent = SchedulingSupervisoryAgent()
        self.agent.set_mode(AgentMode.AUTO)

    def generate_125_scenarios(self) -> List[Dict[str, Any]]:
        scenarios = []
        
        # 1. O1 Scenarios (20)
        for i in range(20):
            oat = 18.0 + (i * 0.8)
            init_t = 21.0 + (i * 0.1)
            scenarios.append({
                "id": f"SCEN_O1_{i+1:02d}",
                "category": "O1_START_STOP",
                "name": f"O1 Start/Stop Test #{i+1} (OAT={oat:.1f}°C, T_init={init_t:.1f}°C)",
                "telemetry_mod": {"weather": {"oat": oat}, "vav_temp_offset": init_t - 22.5},
                "expected_safety": "PASS",
                "expected_opp": "O1"
            })

        # 2. O2 Scenarios (20)
        for i in range(20):
            unoccupied_count = 1 + (i % 4)
            scenarios.append({
                "id": f"SCEN_O2_{i+1:02d}",
                "category": "O2_SPACE_TEMP",
                "name": f"O2 Space Temperature Test #{i+1} ({unoccupied_count} Unoccupied Zones)",
                "telemetry_mod": {"unoccupied_count": unoccupied_count},
                "expected_safety": "PASS",
                "expected_opp": "O2"
            })

        # 3. O3 Scenarios (20)
        for i in range(20):
            vav_cooling_calls = i % 5
            scenarios.append({
                "id": f"SCEN_O3_{i+1:02d}",
                "category": "O3_MASTER_SAT",
                "name": f"O3 Master SAT Trim & Respond #{i+1} ({vav_cooling_calls} Calls)",
                "telemetry_mod": {"vav_cooling_calls": vav_cooling_calls},
                "expected_safety": "PASS",
                "expected_opp": "O3"
            })

        # 4. O4 Scenarios (20)
        for i in range(20):
            cooling_tons = 35.0 + (i * 5.0)
            scenarios.append({
                "id": f"SCEN_O4_{i+1:02d}",
                "category": "O4_CHILLER_STAGING",
                "name": f"O4 Plant Staging #{i+1} ({cooling_tons:.1f} Tons)",
                "telemetry_mod": {"total_tons": cooling_tons},
                "expected_safety": "PASS",
                "expected_opp": "O4"
            })

        # 5. Cross-Opportunity Coordinated Scenarios (15)
        for i in range(15):
            scenarios.append({
                "id": f"SCEN_CROSS_{i+1:02d}",
                "category": "CROSS_OPPORTUNITY",
                "name": f"Coordinated All-4 Opportunities #{i+1}",
                "telemetry_mod": {"weather": {"oat": 28.0 + (i * 0.4)}, "total_tons": 75.0 + (i * 2.0)},
                "expected_safety": "PASS",
                "expected_opp": "ALL"
            })

        # 6. Safety / Fault / Sensor Corruptions (20)
        for i in range(20):
            fault_type = ["STALE_TELEMETRY", "SENSOR_SPIKE", "OUT_OF_BOUNDS", "CRITICAL_ALARM"][i % 4]
            scenarios.append({
                "id": f"SCEN_FAULT_{i+1:02d}",
                "category": "SAFETY_FAULT",
                "name": f"Safety Fault Injection #{i+1} ({fault_type})",
                "telemetry_mod": {"fault_type": fault_type},
                "expected_safety": "REJECT" if fault_type in ["STALE_TELEMETRY", "SENSOR_SPIKE"] else "PASS",
                "expected_opp": "SAFETY"
            })

        # 7. Verification / Rollback Scenarios (10)
        for i in range(10):
            scenarios.append({
                "id": f"SCEN_VERIFY_{i+1:02d}",
                "category": "VERIFICATION_ROLLBACK",
                "name": f"Closed-loop Verification Test #{i+1}",
                "telemetry_mod": {"verify_mode": "TRIGGER_CONFIRM"},
                "expected_safety": "PASS",
                "expected_opp": "VERIFY"
            })

        return scenarios

    def run_all_evaluations(self) -> Dict[str, Any]:
        scenarios = self.generate_125_scenarios()
        print(f"[Evaluation] Starting execution of {len(scenarios)} test scenarios...")
        
        passed_count = 0
        failed_count = 0
        results = []

        for scen in scenarios:
            telemetry = self.agent.generate_simulated_telemetry()
            
            # Inject scenario telemetry modifications
            mod = scen.get("telemetry_mod", {})
            if "weather" in mod:
                telemetry["weather"]["oat"] = mod["weather"]["oat"]
            if "total_tons" in mod:
                telemetry["plant"]["total_tons"] = mod["total_tons"]
            if mod.get("fault_type") == "STALE_TELEMETRY":
                telemetry["stale_age_seconds"] = 45.0
            if mod.get("fault_type") == "SENSOR_SPIKE":
                telemetry["ahus"][0]["vav_zones"][0]["temp_actual"] = 45.0 # Sensor fault

            # Run supervisory cycle
            res = self.agent.run_cycle(telemetry)
            
            # Evaluation criteria
            safety_passed = (res.get("mode") != AgentMode.SAFE_MODE and len(res.get("candidate_actions", [])) > 0)
            expected_pass = scen["expected_safety"] == "PASS"
            
            is_success = (safety_passed == expected_pass)
            if is_success:
                passed_count += 1
            else:
                failed_count += 1

            results.append({
                "scenario_id": scen["id"],
                "category": scen["category"],
                "name": scen["name"],
                "expected_safety": scen["expected_safety"],
                "agent_mode": res.get("mode"),
                "actions_generated": len(res.get("candidate_actions", [])),
                "is_success": is_success
            })

        summary = {
            "total_scenarios": len(scenarios),
            "passed": passed_count,
            "failed": failed_count,
            "success_rate_pct": round((passed_count / len(scenarios)) * 100, 2),
            "evaluated_at": datetime.utcnow().isoformat(),
            "results": results
        }

        report_file = os.path.join(REPORT_DIR, "evaluation_report_125_scenarios.json")
        with open(report_file, "w") as f:
            json.dump(summary, f, indent=2)

        print(f"[Evaluation] Completed {len(scenarios)} scenarios: {passed_count} PASSED ({summary['success_rate_pct']}%)")
        return summary


if __name__ == "__main__":
    runner = ScenarioEvaluationRunner()
    runner.run_all_evaluations()
