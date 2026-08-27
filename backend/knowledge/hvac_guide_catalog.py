"""O1–O20 source catalog encoded from 150317hvacguide.pdf (NSW OEH / AIRAH).

The application does not read the PDF at runtime. Printed page numbers come from
the guide table of contents. Guide potential is GUIDE_POTENTIAL only — never
measured building savings.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.oeh_guide_catalog import GUIDE_META, ROUTES, catalog_entry

SOURCE_DOCUMENT = "150317hvacguide.pdf"
SOURCE_PUBLISHER = "NSW Office of Environment and Heritage / AIRAH"
SOURCE_TITLE = "Optimising your heating, ventilation and air conditioning systems"

# Printed page numbers from the guide table of contents.
GUIDE_PAGES: Dict[str, int] = {
    "O1": 13,
    "O2": 18,
    "O3": 24,
    "O4": 29,
    "O5": 35,
    "O6": 40,
    "O7": 40,
    "O8": 40,
    "O9": 45,
    "O10": 49,
    "O11": 54,
    "O12": 59,
    "O13": 59,
    "O14": 67,
    "O15": 71,
    "O16": 74,
    "O17": 81,
    "O18": 86,
    "O19": 88,
    "O20": 93,
}

GUIDE_SECTIONS: Dict[str, str] = {
    "O1": "Section 2 – System supervisory control optimisations",
    "O2": "Section 2 – System supervisory control optimisations",
    "O3": "Section 2 – System supervisory control optimisations",
    "O4": "Section 2 – System supervisory control optimisations",
    "O5": "Section 3 – Plant control parameter optimisations",
    "O6": "Section 3 – Plant control parameter optimisations",
    "O7": "Section 3 – Plant control parameter optimisations",
    "O8": "Section 3 – Plant control parameter optimisations",
    "O9": "Section 3 – Plant control parameter optimisations",
    "O10": "Section 4 – Ventilation and air flow optimisations",
    "O11": "Section 4 – Ventilation and air flow optimisations",
    "O12": "Section 4 – Ventilation and air flow optimisations",
    "O13": "Section 4 – Ventilation and air flow optimisations",
    "O14": "Section 5 – Variable speed based optimisations",
    "O15": "Section 5 – Variable speed based optimisations",
    "O16": "Section 5 – Variable speed based optimisations",
    "O17": "Section 6 – Best practice HVAC operation and maintenance",
    "O18": "Section 6 – Best practice HVAC operation and maintenance",
    "O19": "Section 6 – Best practice HVAC operation and maintenance",
    "O20": "Section 6 – Best practice HVAC operation and maintenance",
}

CONTROL_KIND: Dict[str, str] = {
    "O1": "control",
    "O2": "control",
    "O3": "control",
    "O4": "control",
    "O5": "control",
    "O6": "control",
    "O7": "control",
    "O8": "control",
    "O9": "advisory",
    "O10": "control",
    "O11": "control",
    "O12": "control",
    "O13": "control",
    "O14": "control",
    "O15": "control",
    "O16": "control",
    "O17": "advisory",
    "O18": "advisory",
    "O19": "advisory",
    "O20": "advisory",
}

ENRICH: Dict[str, Dict[str, Any]] = {
    "O1": {
        "required_inputs": [
            "occupancy schedule",
            "current zone temperatures",
            "zone temperature setpoints",
            "outdoor air temperature",
            "historical thermal response",
            "warm-up/cool-down state",
            "earliest start limit",
            "scheduled occupancy time",
        ],
        "recommended_control_logic": (
            "Determine the shortest required operating period while maintaining comfort: "
            "latest start and earliest stop from indoor/outdoor temperatures and learned thermal response. "
            "If historical thermal response is insufficient: WAIT_FOR_TELEMETRY / NO DATA — do not invent history."
        ),
        "equipment_applicability": ["AHU schedules", "zone temperature sensors", "O/A temperature sensor", "365-day occupancy schedule"],
        "risks": ["Late start missing occupancy comfort", "Insufficient thermal-history data", "Conflicts with after-hours or warmup programs"],
        "benefits": ["Fewer unnecessary operating hours", "Comfort still targeted by occupancy start"],
    },
    "O2": {
        "required_inputs": [
            "zone temperature",
            "cooling setpoint",
            "heating setpoint",
            "deadband",
            "proportional band",
            "deviation",
            "occupancy",
            "comfort limits",
        ],
        "recommended_control_logic": (
            "Review setpoint, deadband, proportional band, deviation, differential and overshoot. "
            "Never change comfort limits without explicit configuration."
        ),
        "equipment_applicability": ["zone temperature controllers", "VAV/FCU zones", "BMS space-temperature loops"],
        "risks": ["Occupant complaints if bands change too quickly", "Overshoot if proportional band is too narrow"],
        "benefits": ["Less cycling and simultaneous heat/cool", "Lower HVAC energy when bands are appropriate"],
    },
    "O3": {
        "required_inputs": [
            "zone temperatures",
            "zone setpoints",
            "VAV demand",
            "AHU SAT",
            "O/A temperature",
            "occupancy",
            "reheat demand",
            "CHW/HW valve positions",
        ],
        "recommended_control_logic": (
            "Use weighted zone demand (third-highest, configurable percentile). Do not blindly average all zones. "
            "Support blacklist/exclusion of faulty or problem zones."
        ),
        "equipment_applicability": ["AHUs with VAV zones", "zone SAT/demand feedback"],
        "risks": ["Rogue or faulty zone driving SAT", "Simultaneous cooling and reheat"],
        "benefits": ["Better SAT vs actual demand", "Reduced reheat from over-cooling"],
    },
    "O4": {
        "required_inputs": [
            "plant cooling load",
            "chiller status",
            "compressor status",
            "capacity",
            "efficiency",
            "CHW temperatures",
            "CW temperatures",
            "operating hours",
            "stage-up/stage-down criteria",
            "lockout conditions",
        ],
        "recommended_control_logic": (
            "Optimised staging with minimum stage time, delayed stage-up, faster stage-down, "
            "internal chiller-control coordination, and cooling-call lockouts. Minimise premature stage-up."
        ),
        "equipment_applicability": ["chiller plant", "compressors", "CHW/CW sensors"],
        "risks": ["Short-cycling", "Inefficient part-load staging", "Lockout misconfiguration"],
        "benefits": ["Fewer unnecessary machines online", "Better plant efficiency at part load"],
    },
    "O5": {
        "required_inputs": [
            "duct static pressure",
            "static pressure setpoint",
            "VAV positions",
            "fan speed",
            "O/A temperature",
            "zone temperatures",
            "VAV minimum airflow",
            "sensor quality",
        ],
        "recommended_control_logic": (
            "Reduce static pressure/fan speed when demand allows, targeting the most-open VAV condition. "
            "Protect against pressure-sensor faults, VAV faults, unstable loops, motor minimum speed, and minimum VAV pressure."
        ),
        "equipment_applicability": ["VSD supply fans", "VAV boxes with damper feedback", "duct static sensors"],
        "risks": ["Unstable loops", "Uncalibrated pressure sensors", "VAV maintenance issues", "Motor turndown limits"],
        "benefits": ["Lower fan energy at part load"],
    },
    "O6": {
        "required_inputs": [
            "HHW supply temperature",
            "HHW return temperature",
            "space heating demand",
            "outdoor temperature",
            "valve positions",
            "boiler operating state",
            "equipment limits",
        ],
        "recommended_control_logic": (
            "Provide the coolest heating water that satisfies demand while respecting equipment limits. "
            "For conventional boilers, preserve manufacturer-required return-temperature constraints. Never invent boiler limits."
        ),
        "equipment_applicability": ["HHW boilers", "heating coils", "HHW pumps/valves"],
        "risks": ["Condensation/corrosion if return temperature is too low on conventional boilers"],
        "benefits": ["Lower heating-water energy and distribution losses"],
    },
    "O7": {
        "required_inputs": [
            "CHW supply",
            "CHW return",
            "cooling load",
            "zone demand",
            "valve positions",
            "chiller efficiency",
            "O/A temperature",
            "humidity where applicable",
        ],
        "recommended_control_logic": (
            "Provide the warmest CHW that still satisfies cooling demand while minimising total plant energy, "
            "not one component in isolation."
        ),
        "equipment_applicability": ["chillers", "CHW coils", "secondary CHW loops"],
        "risks": ["Latent/humidity issues if CHW is too warm", "Local coil starvation"],
        "benefits": ["Higher chiller efficiency at warmer leaving water when demand allows"],
    },
    "O8": {
        "required_inputs": [
            "CW supply",
            "CW return",
            "condenser load",
            "outdoor conditions",
            "cooling tower state",
            "chiller efficiency",
            "pump/fan status",
        ],
        "recommended_control_logic": (
            "Provide the coolest condenser water that is beneficial to total system energy without violating equipment limits."
        ),
        "equipment_applicability": ["cooling towers", "CW pumps", "water-cooled chillers"],
        "risks": ["Tower/approach limits", "Chiller low-CW lockouts", "Plant energy trade-off vs tower fans"],
        "benefits": ["Lower compressor energy when cooler CW is available and allowed"],
    },
    "O9": {
        "required_inputs": [
            "TXV/EEV type",
            "refrigeration system type",
            "refrigerant",
            "superheat",
            "compressor load",
            "system age",
            "system capacity",
            "remaining economic life",
            "variable-load characteristics",
        ],
        "recommended_control_logic": (
            "Engineering retrofit recommendation only — do not automatically control refrigerant. "
            "Guide identifies ~2–3°C superheat as an EEV control region and ~5–7°C for TXV adjustment where EEV retrofit is not cost-effective. "
            "Manufacturer review required."
        ),
        "equipment_applicability": ["larger DX refrigeration circuits", "air-cooled/water-cooled DX"],
        "risks": ["Warranty void without manufacturer advice", "Incorrect superheat harming compressors"],
        "benefits": ["Better part-load expansion control when EEV is applicable"],
    },
    "O10": {
        "required_inputs": [
            "outdoor air temperature",
            "outdoor air humidity",
            "outdoor air enthalpy",
            "return air temperature",
            "return air humidity",
            "return air enthalpy",
            "zone cooling setpoint",
            "supply air temperature",
            "damper positions",
            "cooling call",
            "fire mode",
            "IAQ status",
        ],
        "recommended_control_logic": (
            "Activate from measured conditions: cooling call active, outdoor-air total energy lower than return air, "
            "and outdoor/internal conditions inside operating limits. Guide typical beneficial region: O/A ~10–20°C, "
            "enthalpy <52 kJ/kg, dew point <12°C — consider O/A temperature, R/A temperature and dew point/enthalpy. "
            "Disable in fire mode, invalid sensors, unsuitable outdoor air; protect pressurization, IAQ, and dampers."
        ),
        "equipment_applicability": ["AHUs with economy/economizer dampers", "O/A and R/A temperature/humidity sensors"],
        "risks": ["Humidity/IAQ issues", "Fire-mode damper conflict", "Sensor faults enabling free cooling incorrectly"],
        "benefits": ["Compressor-off free cooling when outdoor air is suitable"],
    },
    "O11": {
        "required_inputs": [
            "zone temperature",
            "cooling setpoint",
            "outdoor temperature",
            "outdoor humidity/dew point",
            "occupancy schedule",
            "purge window",
            "AHU state",
            "fan energy",
            "previous purge state",
        ],
        "recommended_control_logic": (
            "Mechanical night purge when AHU average zone temperature is sufficiently above cooling setpoint, "
            "shortly before morning startup, O/A sufficiently cooler than indoor air, favourable humidity/dew-point, "
            "and fan energy must not exceed expected cooling benefit. Guide example: ~1.5°C above cooling setpoint "
            "and approximately 3–5°C cooler outdoor air."
        ),
        "equipment_applicability": ["AHUs with night-purge capability", "occupancy schedules"],
        "risks": ["Fan energy exceeding cooling benefit", "Conflict with heating/reheat", "Humidity"],
        "benefits": ["Pre-cool building mass with outdoor air when conditions allow"],
    },
    "O12": {
        "required_inputs": [
            "CO2 sensors",
            "zone occupancy",
            "O/A flow",
            "damper position",
            "fan speed",
            "ventilation minimum",
            "operating schedule",
        ],
        "recommended_control_logic": (
            "Use CO2 as occupancy/IAQ indicator and modulate outdoor air. Guide discusses typical CO2 setpoint ranges "
            "around 600–800 ppm and ~800–1000 ppm as an energy-efficiency target range depending on application/standards. "
            "Configurable and source-labeled — not a universal legal limit."
        ),
        "equipment_applicability": ["occupied-space CO2 sensors", "OA dampers", "VAV/AHU ventilation"],
        "risks": ["Underventilation if sensors fail", "Standards/code applicability"],
        "benefits": ["Less outdoor-air conditioning when spaces are sparsely occupied"],
    },
    "O13": {
        "required_inputs": [
            "CO sensors",
            "highest CO",
            "fan speed",
            "airflow",
            "zone/area",
            "operating state",
            "ventilation requirements",
        ],
        "recommended_control_logic": (
            "Carparks and loading docks. CO master signal should be high-select. Use stored configured AS 1668.2 / site limits. "
            "Do not invent safety thresholds. Safety dominates energy optimization."
        ),
        "equipment_applicability": ["carpark/loading-dock CO sensors", "exhaust/supply fans"],
        "risks": ["Toxic exposure if energy reset overrides safety", "Sensor failure"],
        "benefits": ["Fan energy reduction when CO is low while retaining high-select safety"],
    },
    "O14": {
        "required_inputs": [
            "CHW valve positions",
            "most-open valve",
            "CHW differential pressure",
            "pump speed",
            "pump power",
            "CHW load",
            "pump limits",
        ],
        "recommended_control_logic": (
            "When valves are below the maximum target opening, reduce secondary pump speed/pressure incrementally "
            "while maintaining the most-open valve near the guide target (~95%). Do not display predicted kW saving "
            "unless enough actual input data exists."
        ),
        "equipment_applicability": ["secondary CHW pumps with VSD", "2-port CHW valves", "DP sensors"],
        "risks": ["Starved coils if reset is too aggressive", "Stuck-open valves as false index"],
        "benefits": ["Lower SCHW pump energy at part load"],
    },
    "O15": {
        "required_inputs": [
            "ambient dry bulb",
            "condensing temperature",
            "head pressure",
            "refrigerant",
            "compressor state",
            "condenser fan speed",
            "fan power",
            "manufacturer limits",
        ],
        "recommended_control_logic": (
            "VSD/EC condenser fans hold minimum head pressure that still allows expansion valves to work. "
            "Guide: air-cooled condensing temperature typically ~8–12°C above ambient dry bulb — use as strategy, "
            "make equipment-specific limits configurable. Manufacturer review required."
        ),
        "equipment_applicability": ["air-cooled condensers", "VSD or EC condenser fans"],
        "risks": ["Over-condensing with TXVs", "Compressor oil return", "Warranty if manufacturer not consulted"],
        "benefits": ["Lower condenser-fan energy at part load"],
    },
    "O16": {
        "required_inputs": [
            "condenser pressure",
            "condenser temperature",
            "CW supply/return",
            "CW flow",
            "pump speed",
            "pump power",
            "modulating valve position",
            "AC unit status",
        ],
        "recommended_control_logic": (
            "Single AC unit: VSD-controlled CW pump. Multiple AC units on common CW: CW modulating head-pressure valves. "
            "When equipment is off, CW isolation must follow equipment/manufacturer design requirements."
        ),
        "equipment_applicability": ["water-cooled DX units", "CW pumps", "head-pressure valves"],
        "risks": ["Flow to idle units", "Insufficient head pressure", "Isolation valve design mismatch"],
        "benefits": ["Lower CW pumping energy at part load and when units are off"],
    },
    "O17": {
        "required_inputs": [
            "energy data if available",
            "utility data",
            "BMS trends",
            "maintenance findings",
            "equipment inventory",
            "opportunity statuses",
            "energy targets",
            "previous plans",
        ],
        "recommended_control_logic": (
            "O&M planning agent. Do not automatically write HVAC setpoints. Site-specific initiatives, monthly targets, "
            "BMS/utility/maintenance data, stakeholder coordination, documentation, training, and regular reporting."
        ),
        "equipment_applicability": ["facility energy-management process", "not a setpoint loop"],
        "risks": ["Plan without measurement/verification", "Gains reverting without governance"],
        "benefits": ["Sustained optimisation through documented targets and reviews"],
    },
    "O18": {
        "required_inputs": [
            "training programs",
            "target groups",
            "completion records",
            "awareness campaigns",
        ],
        "recommended_control_logic": (
            "No equipment dispatch. Formal training vs informal awareness. Site-specific documentation. "
            "Guide groups: facility managers, HVAC operators, maintenance personnel, contractors, sustainability team, occupants."
        ),
        "equipment_applicability": ["people and procedures, not plant setpoints"],
        "risks": ["Ad hoc control changes from untrained operators"],
        "benefits": ["Better-informed operation and occupant behaviour"],
    },
    "O19": {
        "required_inputs": [
            "equipment health",
            "maintenance findings",
            "schedules",
            "sensor/control inspection status",
        ],
        "recommended_control_logic": (
            "No HVAC setpoint dispatch. Site-specific schedules, inspections, trained personnel, performance KPIs, "
            "performance-based maintenance. Include O/A T/RH, S/A T, CO/CO2, CHW/HW T, velocity, pressure, dampers, fans/VSD, BMS trends."
        ),
        "equipment_applicability": ["HVAC plant inspection and calibration program"],
        "risks": ["Drift from uncalibrated sensors", "Failed VAVs/dampers undermining reset strategies"],
        "benefits": ["Plant stays closer to designed performance"],
    },
    "O20": {
        "required_inputs": [
            "BMS software inventory",
            "controller inventory",
            "versions",
            "backup status",
            "change log",
            "schedule validation",
        ],
        "recommended_control_logic": (
            "Governance/audit only — no login and no direct BMS software modification from this page. "
            "Documented control settings, change logs, backups, controlled programming changes, event logs, documented procedures."
        ),
        "equipment_applicability": ["BMS/controllers as configuration assets"],
        "risks": ["Factory-default revert after patches", "Undocumented setpoint changes"],
        "benefits": ["Retained optimized settings and traceable change control"],
    },
}


def source_reference(oid: str) -> Dict[str, Any]:
    return {
        "document": SOURCE_DOCUMENT,
        "publisher": SOURCE_PUBLISHER,
        "title": SOURCE_TITLE,
        "opportunity": oid,
        "page": GUIDE_PAGES.get(oid),
        "section": GUIDE_SECTIONS.get(oid),
    }


def catalog_record(oid: str) -> Optional[Dict[str, Any]]:
    key = (oid or "").strip().upper()
    row = catalog_entry(key)
    meta = GUIDE_META.get(key)
    extra = ENRICH.get(key)
    if not row or not meta or not extra:
        return None
    _oid, num, _section_key, title, _desc = row
    pct = meta.get("pct")
    return {
        "id": key,
        "opportunity_id": key,
        "number": num,
        "title": title,
        "section": GUIDE_SECTIONS[key],
        "guide_page": GUIDE_PAGES[key],
        "source": SOURCE_PUBLISHER,
        "strategy": meta.get("summary"),
        "strategy_summary": meta.get("summary"),
        "required_inputs": extra["required_inputs"],
        "recommended_control_logic": extra["recommended_control_logic"],
        "equipment_applicability": extra["equipment_applicability"],
        "applicability": extra["equipment_applicability"],
        "risks": extra["risks"],
        "benefits": extra["benefits"],
        "guide_potential": f"Up to {pct}% (guide potential; not measured savings)" if pct is not None else None,
        "guide_savings_potential": f"Up to {pct}% (guide potential; not measured savings)" if pct is not None else None,
        "energy_impact_class": "GUIDE_POTENTIAL",
        "control_kind": CONTROL_KIND[key],
        "route": ROUTES[key],
        "source_reference": source_reference(key),
        "inputs": extra["required_inputs"],
    }


def catalog_all() -> List[Dict[str, Any]]:
    return [catalog_record(f"O{i}") for i in range(1, 21)]


def is_advisory(oid: str) -> bool:
    return CONTROL_KIND.get((oid or "").strip().upper()) == "advisory"
