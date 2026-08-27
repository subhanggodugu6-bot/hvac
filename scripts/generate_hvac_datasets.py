"""
HVAC Scheduling & Supervisory Agent Dataset Generator
Generates the complete 4-layer production dataset and 2,500 evaluation scenarios:
- Point Catalog (100+ BMS points)
- Telemetry Layers (O1, O2, O3, O4)
- 2,500 Comprehensive Scenarios (O1: 500, O2: 500, O3: 500, O4: 500, Safety/Fault: 500)
- Expected Results & Supervisory Decisions
"""
import os
import json
import random
import math
from datetime import datetime, timedelta

DATASET_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dataset", "scheduling_supervisory"))
TELEMETRY_DIR = os.path.join(DATASET_ROOT, "telemetry")
SCENARIOS_DIR = os.path.join(DATASET_ROOT, "scenarios")
EXPECTED_DIR = os.path.join(DATASET_ROOT, "expected_results")

os.makedirs(DATASET_ROOT, exist_ok=True)
os.makedirs(TELEMETRY_DIR, exist_ok=True)
os.makedirs(SCENARIOS_DIR, exist_ok=True)
os.makedirs(EXPECTED_DIR, exist_ok=True)


def generate_point_catalog():
    points = []
    # AHU Points
    for a in range(1, 3):
        ahu_id = f"AHU-0{a}"
        points.extend([
            {"point_id": f"{ahu_id}.SAT.TEMP", "equipment_id": ahu_id, "category": "supply_air_temperature", "unit": "degC", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{ahu_id}.SAT.SETPOINT", "equipment_id": ahu_id, "category": "supply_air_temperature_setpoint", "unit": "degC", "datatype": "float", "readable": True, "writable": True},
            {"point_id": f"{ahu_id}.RAT.TEMP", "equipment_id": ahu_id, "category": "return_air_temperature", "unit": "degC", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{ahu_id}.AIRFLOW.CFM", "equipment_id": ahu_id, "category": "airflow", "unit": "CFM", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{ahu_id}.STATIC_PRESS.PA", "equipment_id": ahu_id, "category": "static_pressure", "unit": "Pa", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{ahu_id}.FAN.SPEED_PCT", "equipment_id": ahu_id, "category": "fan_speed", "unit": "pct", "datatype": "float", "readable": True, "writable": True},
            {"point_id": f"{ahu_id}.FAN.POWER_KW", "equipment_id": ahu_id, "category": "fan_power", "unit": "kW", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{ahu_id}.COOLING_VALVE.POS_PCT", "equipment_id": ahu_id, "category": "cooling_valve", "unit": "pct", "datatype": "float", "readable": True, "writable": True},
            {"point_id": f"{ahu_id}.HEATING_VALVE.POS_PCT", "equipment_id": ahu_id, "category": "heating_valve", "unit": "pct", "datatype": "float", "readable": True, "writable": True},
            {"point_id": f"{ahu_id}.OCCUPANCY.STATUS", "equipment_id": ahu_id, "category": "occupancy_status", "unit": "enum", "datatype": "boolean", "readable": True, "writable": False},
            {"point_id": f"{ahu_id}.START_STOP.CMD", "equipment_id": ahu_id, "category": "start_stop_command", "unit": "enum", "datatype": "boolean", "readable": True, "writable": True},
        ])

        # VAV Zone Points (6 zones per AHU)
        for z in range(1, 7):
            zone_num = (a - 1) * 6 + z
            zone_id = f"ZONE-{zone_num:02d}"
            vav_id = f"VAV-{100 + zone_num}"
            points.extend([
                {"point_id": f"{ahu_id}.{zone_id}.TEMP", "equipment_id": vav_id, "zone_id": zone_id, "category": "zone_temperature", "unit": "degC", "datatype": "float", "readable": True, "writable": False},
                {"point_id": f"{ahu_id}.{zone_id}.COOLING_SP", "equipment_id": vav_id, "zone_id": zone_id, "category": "cooling_setpoint", "unit": "degC", "datatype": "float", "readable": True, "writable": True},
                {"point_id": f"{ahu_id}.{zone_id}.HEATING_SP", "equipment_id": vav_id, "zone_id": zone_id, "category": "heating_setpoint", "unit": "degC", "datatype": "float", "readable": True, "writable": True},
                {"point_id": f"{ahu_id}.{zone_id}.DEADBAND", "equipment_id": vav_id, "zone_id": zone_id, "category": "deadband", "unit": "degC", "datatype": "float", "readable": True, "writable": True},
                {"point_id": f"{ahu_id}.{zone_id}.DAMPER_POS_PCT", "equipment_id": vav_id, "zone_id": zone_id, "category": "damper_position", "unit": "pct", "datatype": "float", "readable": True, "writable": False},
                {"point_id": f"{ahu_id}.{zone_id}.AIRFLOW_CFM", "equipment_id": vav_id, "zone_id": zone_id, "category": "zone_airflow", "unit": "CFM", "datatype": "float", "readable": True, "writable": False},
                {"point_id": f"{ahu_id}.{zone_id}.REHEAT_VALVE_PCT", "equipment_id": vav_id, "zone_id": zone_id, "category": "reheat_valve", "unit": "pct", "datatype": "float", "readable": True, "writable": False},
                {"point_id": f"{ahu_id}.{zone_id}.CO2_PPM", "equipment_id": vav_id, "zone_id": zone_id, "category": "indoor_air_quality", "unit": "PPM", "datatype": "float", "readable": True, "writable": False},
                {"point_id": f"{ahu_id}.{zone_id}.OCCUPANCY", "equipment_id": vav_id, "zone_id": zone_id, "category": "zone_occupancy", "unit": "boolean", "datatype": "boolean", "readable": True, "writable": False},
            ])

    # Chiller Plant Points
    plant_id = "CHILLER-PLANT-01"
    points.extend([
        {"point_id": f"{plant_id}.CHWS.TEMP", "equipment_id": plant_id, "category": "chw_supply_temperature", "unit": "degC", "datatype": "float", "readable": True, "writable": False},
        {"point_id": f"{plant_id}.CHWS.SETPOINT", "equipment_id": plant_id, "category": "chw_supply_setpoint", "unit": "degC", "datatype": "float", "readable": True, "writable": True},
        {"point_id": f"{plant_id}.CHWR.TEMP", "equipment_id": plant_id, "category": "chw_return_temperature", "unit": "degC", "datatype": "float", "readable": True, "writable": False},
        {"point_id": f"{plant_id}.FLOW_RATE.LPS", "equipment_id": plant_id, "category": "chw_flow_rate", "unit": "L/s", "datatype": "float", "readable": True, "writable": False},
        {"point_id": f"{plant_id}.TOTAL_LOAD.TONS", "equipment_id": plant_id, "category": "total_cooling_load", "unit": "Tons", "datatype": "float", "readable": True, "writable": False},
        {"point_id": f"{plant_id}.TOTAL_POWER.KW", "equipment_id": plant_id, "category": "plant_power", "unit": "kW", "datatype": "float", "readable": True, "writable": False},
    ])

    for c in range(1, 3):
        cid = f"CH-0{c}"
        points.extend([
            {"point_id": f"{plant_id}.{cid}.ENABLE_CMD", "equipment_id": cid, "category": "chiller_enable_command", "unit": "enum", "datatype": "boolean", "readable": True, "writable": True},
            {"point_id": f"{plant_id}.{cid}.RUN_STATUS", "equipment_id": cid, "category": "chiller_run_status", "unit": "enum", "datatype": "boolean", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.LOAD_TONS", "equipment_id": cid, "category": "chiller_load", "unit": "Tons", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.POWER_KW", "equipment_id": cid, "category": "chiller_power", "unit": "kW", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.EFFICIENCY_KW_PER_TON", "equipment_id": cid, "category": "chiller_efficiency", "unit": "kW/Ton", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.RUNTIME_HOURS", "equipment_id": cid, "category": "chiller_runtime", "unit": "hours", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.ALARM_STATUS", "equipment_id": cid, "category": "chiller_alarm", "unit": "enum", "datatype": "boolean", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.COMP_1A.LOAD_PCT", "equipment_id": cid, "category": "compressor_load", "unit": "pct", "datatype": "float", "readable": True, "writable": False},
            {"point_id": f"{plant_id}.{cid}.COMP_1B.LOAD_PCT", "equipment_id": cid, "category": "compressor_load", "unit": "pct", "datatype": "float", "readable": True, "writable": False},
        ])

    # Weather Station
    points.extend([
        {"point_id": "WEATHER.OAT.TEMP", "equipment_id": "WEATHER-STATION", "category": "outdoor_air_temperature", "unit": "degC", "datatype": "float", "readable": True, "writable": False},
        {"point_id": "WEATHER.HUMIDITY.PCT", "equipment_id": "WEATHER-STATION", "category": "outdoor_relative_humidity", "unit": "pct", "datatype": "float", "readable": True, "writable": False},
        {"point_id": "WEATHER.SOLAR.WM2", "equipment_id": "WEATHER-STATION", "category": "solar_irradiance", "unit": "W/m2", "datatype": "float", "readable": True, "writable": False},
    ])

    catalog_path = os.path.join(DATASET_ROOT, "point_catalog.json")
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump({"total_points": len(points), "bms_points": points}, f, indent=2)
    with open(os.path.join(DATASET_ROOT, "01_point_catalog.json"), "w", encoding="utf-8") as f:
        json.dump({"total_points": len(points), "bms_points": points}, f, indent=2)

    print(f"Generated Point Catalog with {len(points)} BMS points.")


def generate_scenarios_and_expected_results():
    scenarios = []
    expected_decisions = []
    o1_telemetry = []
    o2_telemetry = []
    o3_telemetry = []
    o4_telemetry = []
    historical_o1 = []

    categories = ["NORMAL", "OPTIMIZATION", "FAULT", "SAFETY"]

    # 1. O1 SCENARIOS (500 Scenarios)
    for i in range(1, 501):
        cat = categories[i % 4]
        sc_id = f"SC-O1-{i:04d}"
        oat = round(random.uniform(15.0, 36.0), 1)
        init_t = round(random.uniform(19.0, 24.5), 1)
        target_t = 23.0
        delta = abs(target_t - init_t)
        base_warmup = int(14.5 * delta + 1.8 * max(0.0, oat - 18.0) + 12)

        if cat == "NORMAL":
            condition = "building_pre_occupancy_nominal"
            exp_action = "START_AT_SCHEDULED"
            exp_start = "06:00"
            conf = 0.95
            reason = "Building thermal pull-down in progress. Nominal schedule aligned."
        elif cat == "OPTIMIZATION":
            condition = "favorable_ambient_warmup_fast"
            exp_action = "START_LATER"
            delay_mins = random.randint(30, 85)
            h = 6 + delay_mins // 60
            m = delay_mins % 60
            exp_start = f"{h:02d}:{m:02d}"
            conf = 0.98
            reason = f"Warm ambient temperature ({oat}°C) allows safe start delay of {delay_mins} minutes."
        elif cat == "FAULT":
            condition = "zone_temp_sensor_frozen"
            exp_action = "SAFE_MODE_FALLBACK"
            exp_start = "06:00"
            conf = 0.60
            reason = "Zone temperature sensor is frozen or reporting stale telemetry. Safety mode engaged."
        else: # SAFETY
            condition = "extreme_cold_pull_down_extended"
            exp_action = "START_EARLIER"
            exp_start = "05:30"
            conf = 0.99
            reason = f"High thermal delta ({delta:.1f}°C) requires early start to guarantee arrival comfort at 08:00."

        sc = {
            "scenario_id": sc_id,
            "opportunity": "O1",
            "category": cat,
            "condition": condition,
            "zone": f"ZONE-{(i % 12) + 1:02d}",
            "occupancy_start": "08:00",
            "occupancy_end": "18:00",
            "outdoor_temperature": oat,
            "initial_zone_temperature": init_t,
            "target_temperature": target_t,
            "scheduled_start": "06:00",
            "historical_warmup_minutes": base_warmup,
            "safety_margin_minutes": 12,
            "expected_action": exp_action,
            "expected_start": exp_start
        }
        scenarios.append(sc)

        dec = {
            "scenario_id": sc_id,
            "opportunity": "O1",
            "selected_action": exp_action,
            "target_point": "AHU-01.START_STOP.CMD",
            "recommended_value": exp_start,
            "confidence": conf,
            "reason": reason,
            "safety_status": "PASS" if cat != "FAULT" else "ENGAGE_SAFE_MODE"
        }
        expected_decisions.append(dec)

        # Historical Record
        historical_o1.append({
            "date": (datetime(2026, 6, 1) + timedelta(days=i % 60)).strftime("%Y-%m-%d"),
            "scenario_id": sc_id,
            "outdoor_temperature": oat,
            "initial_zone_temperature": init_t,
            "target_temperature": target_t,
            "hvac_start": exp_start,
            "target_reached_time": "07:55",
            "warmup_duration": base_warmup,
            "overshoot": round(random.uniform(0.0, 0.3), 2),
            "comfort_result": "OPTIMAL" if cat != "FAULT" else "BREACH",
            "energy_kwh": round(random.uniform(18.5, 34.0), 1)
        })
        o1_telemetry.append(sc)

    # 2. O2 SCENARIOS (500 Scenarios)
    for i in range(1, 501):
        cat = categories[i % 4]
        sc_id = f"SC-O2-{i:04d}"
        zid = f"ZONE-{(i % 12) + 1:02d}"
        occupied = (cat != "OPTIMIZATION" and i % 3 != 0) or (cat == "OPTIMIZATION" and i % 2 == 0)
        curr_t = round(random.uniform(21.5, 24.2), 1)
        curr_sp = 22.5
        db = 1.5 if occupied else 4.0
        damper = round(random.uniform(15.0, 95.0), 1)
        clg_demand = round(damper / 100.0, 2)
        oat = round(random.uniform(20.0, 32.0), 1)

        if cat == "NORMAL":
            condition = "comfort_setpoint_balanced"
            exp_action = "MAINTAIN_SETPOINT"
            cand_sp = curr_sp
            reason = "Zone temperature and damper position in optimal equilibrium."
            conf = 0.96
        elif cat == "OPTIMIZATION":
            if not occupied:
                condition = "unoccupied_setback_opportunity"
                exp_action = "APPLY_SETBACK"
                cand_sp = 24.5
                reason = f"Zone {zid} is unoccupied. Reset setpoint to 24.5°C and expand deadband to ±4.0°C."
            else:
                condition = "comfort_floating_opportunity"
                exp_action = "FLOAT_SETPOINT_WARMER"
                cand_sp = 23.5
                reason = f"Zone {zid} has low cooling call ({clg_demand:.0%}). Float setpoint to 23.5°C within ASHRAE 55."
            conf = 0.98
        elif cat == "FAULT":
            condition = "sensor_out_of_bounds"
            exp_action = "EXCLUDE_AND_MAINTAIN_SAFE_SETPOINT"
            cand_sp = 22.5
            curr_t = 38.5 # Faulty spike
            reason = f"Sensor for {zid} reports 38.5°C (out-of-bounds). Excluded from supervisory setpoint shift."
            conf = 0.50
        else: # SAFETY
            condition = "comfort_boundary_breach_prevention"
            exp_action = "CLAMP_SETPOINT"
            cand_sp = 24.0
            reason = "Proposed setpoint exceeds ASHRAE 55 upper comfort boundary (24.5°C). Clamped."
            conf = 0.99

        sc = {
            "scenario_id": sc_id,
            "opportunity": "O2",
            "category": cat,
            "condition": condition,
            "zone_id": zid,
            "occupancy": occupied,
            "actual_temperature": curr_t,
            "current_setpoint": curr_sp,
            "deadband": db,
            "cooling_proportional_band": 1.5,
            "heating_proportional_band": 1.5,
            "cooling_demand": clg_demand,
            "outdoor_temperature": oat,
            "hvac_power_kw": round(random.uniform(42.0, 85.0), 1),
            "comfort_min": 20.0,
            "comfort_max": 24.5,
            "candidate_setpoint": cand_sp,
            "expected_decision": exp_action
        }
        scenarios.append(sc)

        dec = {
            "scenario_id": sc_id,
            "opportunity": "O2",
            "selected_action": exp_action,
            "target_point": f"AHU-01.{zid}.COOLING_SP",
            "recommended_value": cand_sp,
            "confidence": conf,
            "reason": reason,
            "safety_status": "PASS" if cat != "FAULT" else "SENSOR_FAULT_EXCLUDED"
        }
        expected_decisions.append(dec)
        o2_telemetry.append(sc)

    # 3. O3 SCENARIOS (500 Scenarios) - Multi-Zone Payloads
    for i in range(1, 501):
        cat = categories[i % 4]
        sc_id = f"SC-O3-{i:04d}"
        curr_sat = 13.0
        zones_data = []

        for z in range(1, 6):
            zid = f"ZONE-{z:02d}"
            sq = "GOOD"
            if cat == "FAULT" and z == 3:
                sq = "FAULT"
            z_temp = round(random.uniform(22.0, 24.0), 1)
            z_dem = round(random.uniform(0.20, 0.85), 2)
            zones_data.append({
                "zone_id": zid,
                "temperature": z_temp,
                "setpoint": 23.0,
                "cooling_demand": z_dem,
                "sensor_quality": sq
            })

        active_dems = sorted([zd["cooling_demand"] for zd in zones_data if zd["sensor_quality"] == "GOOD"], reverse=True)
        third_high = active_dems[2] if len(active_dems) >= 3 else active_dems[0]

        if cat == "NORMAL":
            condition = "vav_demand_balanced"
            exp_action = "HOLD_SAT"
            target_sat = 13.0
            reason = f"Master demand ({third_high:.2f}) is in equilibrium with design SAT (13.0°C)."
            conf = 0.95
        elif cat == "OPTIMIZATION":
            condition = "low_vav_cooling_demand_trim_warmer"
            exp_action = "TRIM_SAT_WARMER"
            target_sat = 13.5
            reason = f"Downstream VAV master demand is low ({third_high:.2f}). Trim SAT warmer to 13.5°C to save chiller lift."
            conf = 0.97
        elif cat == "FAULT":
            condition = "faulty_vav_sensor_detected"
            exp_action = "EXCLUDE_FAULTY_ZONE_AND_TRIM"
            target_sat = 13.3
            reason = "ZONE-03 sensor quality is FAULT. Excluded from master demand calculation."
            conf = 0.93
        else: # SAFETY
            condition = "freeze_stat_prevention_limit"
            exp_action = "CLAMP_SAT_FREEZE_GUARD"
            target_sat = 12.0
            reason = "Proposed SAT reaches minimum engineering limit (12.0°C). Freeze-stat clamp applied."
            conf = 0.99

        sc = {
            "scenario_id": sc_id,
            "opportunity": "O3",
            "category": cat,
            "condition": condition,
            "ahu_id": "AHU-01",
            "current_sat": curr_sat,
            "zones": zones_data,
            "master_demand_method": "third_highest",
            "expected_master_demand": round(third_high, 2),
            "expected_action": exp_action,
            "target_sat": target_sat
        }
        scenarios.append(sc)

        dec = {
            "scenario_id": sc_id,
            "opportunity": "O3",
            "selected_action": exp_action,
            "target_point": "AHU-01.SAT.SETPOINT",
            "recommended_value": target_sat,
            "confidence": conf,
            "reason": reason,
            "safety_status": "PASS"
        }
        expected_decisions.append(dec)
        o3_telemetry.append(sc)

    # 4. O4 SCENARIOS (500 Scenarios)
    for i in range(1, 501):
        cat = categories[i % 4]
        sc_id = f"SC-O4-{i:04d}"
        ch1_alarm = (cat == "FAULT")
        
        if cat == "NORMAL":
            condition = "single_chiller_optimal_cop"
            load_kw = 260
            active_c = 1
            exp_action = "HOLD_STAGING"
            exp_stages = 1
            chws_sp = 6.7
            reason = f"Plant load ({load_kw} kW / 74 Tons) operating at peak single chiller COP (6.4)."
            conf = 0.96
        elif cat == "OPTIMIZATION":
            condition = "excessive_capacity_stage_down"
            load_kw = 280
            active_c = 2
            exp_action = "STAGE_DOWN_CH-02"
            exp_stages = 1
            chws_sp = 7.2
            reason = f"Total load is {load_kw} kW. Stopping CH-02 consolidates load into 1 chiller @ 63% PLR, increasing COP."
            conf = 0.98
        elif cat == "FAULT":
            condition = "chiller_oil_pressure_alarm"
            load_kw = 340
            active_c = 2
            exp_action = "DO_NOT_STAGE_DOWN"
            exp_stages = 2
            chws_sp = 6.7
            reason = "CH-01 has active alarm. Stage-down inhibited to prevent loss of cooling capacity."
            conf = 0.90
        else: # SAFETY
            condition = "insufficient_capacity_stage_up"
            load_kw = 430
            active_c = 1
            exp_action = "STAGE_UP_CH-02"
            exp_stages = 2
            chws_sp = 6.7
            reason = f"Plant load ({load_kw} kW / 122 Tons) exceeds 90% single chiller capacity. Staging up CH-02."
            conf = 0.99

        chillers_list = [
            {"id": "CH-01", "capacity_kw": 420, "load_kw": load_kw if active_c == 1 else load_kw // 2, "status": "ON", "runtime_minutes": 240, "alarm": ch1_alarm},
            {"id": "CH-02", "capacity_kw": 420, "load_kw": 0 if active_c == 1 else load_kw // 2, "status": "ON" if active_c == 2 else "STANDBY", "runtime_minutes": 180 if active_c == 2 else 0, "alarm": False}
        ]

        sc = {
            "scenario_id": sc_id,
            "opportunity": "O4",
            "category": cat,
            "condition": condition,
            "plant_id": "CHILLER-PLANT-01",
            "total_cooling_load_kw": load_kw,
            "chillers": chillers_list,
            "chw_supply_temperature": 6.8,
            "chw_target_temperature": chws_sp,
            "expected_optimal_stages": exp_stages,
            "expected_action": exp_action
        }
        scenarios.append(sc)

        dec = {
            "scenario_id": sc_id,
            "opportunity": "O4",
            "selected_action": exp_action,
            "target_point": "CHILLER-PLANT-01.CH-02.ENABLE_CMD",
            "recommended_value": 0.0 if exp_action == "STAGE_DOWN_CH-02" else (1.0 if exp_action == "STAGE_UP_CH-02" else 1.0),
            "confidence": conf,
            "reason": reason,
            "safety_status": "PASS" if not ch1_alarm else "ALARM_HOLD"
        }
        expected_decisions.append(dec)
        o4_telemetry.append(sc)

    # 5. SAFETY & FAULT NEGATIVE SCENARIOS (500 Scenarios)
    negative_types = [
        ("SC-FAULT-STALE-", "stale_telemetry_timeout", "Telemetry timestamp > 45 seconds old. Supervisory cycle blocked."),
        ("SC-FAULT-FROZEN-", "sensor_frozen_rate_of_change", "Zone temperature unchanged for 120 cycles. Sensor marked FROZEN."),
        ("SC-SAFETY-LIFT-", "chws_freeze_limit_violation", "Requested CHWS setpoint < 5.5°C violates freeze safety minimum."),
        ("SC-SAFETY-CONFLICT-", "supervisory_command_conflict", "Simultaneous conflicting SAT reset and zone reheat request detected."),
        ("SC-FAULT-FLOW-", "primary_chw_low_flow_trip", "Primary loop flow < 12.0 L/s. Chiller stage-down rejected.")
    ]

    for i in range(1, 501):
        prefix, neg_type, neg_reason = negative_types[i % len(negative_types)]
        sc_id = f"{prefix}{i:04d}"

        sc = {
            "scenario_id": sc_id,
            "opportunity": "SAFETY_SUPERVISORY",
            "category": "FAULT_NEGATIVE",
            "condition": neg_type,
            "telemetry_age_seconds": 65 if "STALE" in prefix else 2,
            "sensor_fault_flag": True if "FROZEN" in prefix else False,
            "critical_alarm_present": True if "FLOW" in prefix else False,
            "expected_action": "REJECT_AND_ENGAGE_SAFE_MODE",
            "expected_reason": neg_reason
        }
        scenarios.append(sc)

        dec = {
            "scenario_id": sc_id,
            "opportunity": "SAFETY_SUPERVISORY",
            "selected_action": "REJECT_AND_ENGAGE_SAFE_MODE",
            "target_point": "BMS_SUPERVISORY_GATEWAY",
            "recommended_value": "NO_OP_SAFE_MODE",
            "confidence": 0.99,
            "reason": neg_reason,
            "safety_status": "REJECTED_SAFETY_GUARDRAIL"
        }
        expected_decisions.append(dec)

    # Write files
    def write_jsonl(filepath, records):
        with open(filepath, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

    # Layer files
    write_jsonl(os.path.join(TELEMETRY_DIR, "o1_telemetry.jsonl"), o1_telemetry)
    write_jsonl(os.path.join(TELEMETRY_DIR, "o2_telemetry.jsonl"), o2_telemetry)
    write_jsonl(os.path.join(TELEMETRY_DIR, "o3_telemetry.jsonl"), o3_telemetry)
    write_jsonl(os.path.join(TELEMETRY_DIR, "o4_telemetry.jsonl"), o4_telemetry)
    write_jsonl(os.path.join(SCENARIOS_DIR, "scheduling_scenarios.jsonl"), scenarios)
    write_jsonl(os.path.join(EXPECTED_DIR, "expected_decisions.jsonl"), expected_decisions)

    # Root convenience files
    write_jsonl(os.path.join(DATASET_ROOT, "02_live_telemetry.jsonl"), o1_telemetry[:100] + o2_telemetry[:100] + o3_telemetry[:100] + o4_telemetry[:100])
    write_jsonl(os.path.join(DATASET_ROOT, "03_historical_thermal_response.jsonl"), historical_o1)
    write_jsonl(os.path.join(DATASET_ROOT, "04_scheduling_scenarios.jsonl"), scenarios)
    write_jsonl(os.path.join(DATASET_ROOT, "05_expected_decisions.jsonl"), expected_decisions)

    print(f"Successfully generated total {len(scenarios)} evaluation scenarios and expected decisions!")


if __name__ == "__main__":
    generate_point_catalog()
    generate_scenarios_and_expected_results()
