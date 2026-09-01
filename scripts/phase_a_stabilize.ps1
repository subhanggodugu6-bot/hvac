# Phase A — stabilize NB2 pipeline (local dev)
# Usage: cd c:\hvac; .\scripts\phase_a_stabilize.ps1

$ErrorActionPreference = "Stop"
$Base = "http://localhost:8000"

function Step($n, $msg) { Write-Host "`n=== A$n $msg ===" -ForegroundColor Cyan }

Step 1 "Environment"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example — set GEMINI_API_KEY before LLM explain."
}

Step 2 "API health"
try {
    $h = Invoke-RestMethod "$Base/healthz" -TimeoutSec 5
    Write-Host "healthz: $($h.status)"
} catch {
    Write-Host "API not running. Start: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Yellow
    exit 1
}

Step 3 "Plant mode DATASET + sim seed"
Invoke-RestMethod -Method POST -Uri "$Base/api/platform/plant-mode" -ContentType "application/json" `
    -Body '{"mode":"DATASET","reason":"Phase A stabilize"}' | Out-Null
python -c @"
import os
os.environ.setdefault('HVAC_BMS_MODE','simulation')
os.environ.setdefault('HVAC_USE_SIMULATION','1')
from backend.services.platform_ops_service import set_plant_mode
from backend.bms.simulation_telemetry import seed_synthetic_history, publish_once
set_plant_mode('DATASET')
n = seed_synthetic_history(hours=3.0, step_minutes=1.0)
publish_once()
print('seeded_points', n)
"@

Step 4 "Endpoint checks"
@(
    @{ Name = "pipeline"; Url = "$Base/api/platform/ai/pipeline/status" },
    @{ Name = "llm"; Url = "$Base/api/platform/ai/llm/status" },
    @{ Name = "rls"; Url = "$Base/api/platform/ai/rls/status" },
    @{ Name = "readyz"; Url = "$Base/api/readyz" }
) | ForEach-Object {
    $r = Invoke-RestMethod $_.Url -TimeoutSec 10
    if ($_.Name -eq "pipeline") { Write-Host "$($_.Name): worker=$($r.worker.worker_running)" }
    elseif ($_.Name -eq "llm") {
        $g = ($r.free_options.providers | Where-Object { $_.id -eq "gemini" }).available
        Write-Host "$($_.Name): gemini available=$g"
    }
    else { Write-Host "$($_.Name): OK" }
}

Step 5 "Normalized telemetry"
$norm = Invoke-RestMethod "$Base/api/platform/ai/normalized?zone_id=ZONE-01&step_seconds=60"
$recs = @($norm.records)
$good = ($recs | Where-Object { $_.quality -in @("GOOD","STALE") -and $null -ne $_.HVAC_Power }).Count
Write-Host "rows=$($recs.Count) trainable=$good"

Step 6 "Pipeline + Safe RL"
$pipe = Invoke-RestMethod -Method POST "$Base/api/platform/ai/pipeline/run?zone_id=ZONE-01"
Write-Host "pipeline code=$($pipe.code) stages=$($pipe.stages.Keys -join ',')"
$rec = Invoke-RestMethod -Method POST -Uri "$Base/api/platform/ai/safe-rl/recommend" -ContentType "application/json" -Body '{"zone_id":"ZONE-01"}'
Write-Host "safe-rl status=$($rec.status) code=$($rec.code)"

Step 7 "LSTM train (optional)"
try {
    $train = Invoke-RestMethod -Method POST -Uri "$Base/api/platform/ai/lstm/train" -ContentType "application/json" -Body '{"zone_id":"ZONE-01"}'
    $ok = ($train.results | Where-Object { $_.code -eq "OK" }).Count
    Write-Host "LSTM targets trained OK: $ok / $($train.results.Count)"
} catch {
    Write-Host "LSTM train skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

Step 8 "Tests"
python -m pytest backend/tests/test_ai_pipeline.py backend/tests/test_llm_hook.py -q
Write-Host "`nPhase A complete. Open http://localhost:3000/ml for UI." -ForegroundColor Green
