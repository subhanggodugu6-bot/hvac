from typing import Dict

class SetpointRateLimiter:
    """Restricts rate-of-change on analog setpoints to prevent thermal shock and equipment hunting."""

    def __init__(self):
        # Max change permitted per 15-minute supervisory cycle
        self.MAX_RATE_PER_CYCLE = {
            "ZONE_TEMP_SP": 0.5,  # max 0.5°C per step
            "AHU_SAT_SP": 0.6,   # max 0.6°C per step
            "CHWS_SP": 0.5,       # max 0.5°C per step
            "PUMP_SPEED": 10.0,   # max 10 % per step (O14/O16)
            "DUCT_STATIC": 0.15,  # max 0.15 in.wc per step (O5)
        }

    def limit_step(self, current_val: float, proposed_val: float, point_category: str) -> float:
        max_delta = self.MAX_RATE_PER_CYCLE.get(point_category, 0.5)
        raw_delta = proposed_val - current_val

        if abs(raw_delta) > max_delta:
            clamped_delta = max_delta if raw_delta > 0 else -max_delta
            return round(current_val + clamped_delta, 2)
        return proposed_val
