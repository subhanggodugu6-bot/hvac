# Phase B — Stage A live BACnet commissioning (lab gateway, read-only)
# Usage: cd c:\hvac; .\scripts\phase_b_commission.ps1

$ErrorActionPreference = "Stop"
$Base = "http://localhost:8000"

Write-Host "=== Phase B: Stage A BACnet commission ===" -ForegroundColor Cyan

Write-Host "`nB1 Running stage_a_commission.py (discover -> map -> poll)..."
$env:HVAC_BMS_MODE = "production"
$env:HVAC_BMS_LAB = "1"
$env:HVAC_BMS_WRITE_ENABLED = "0"
$env:HVAC_USE_SIMULATION = "0"
$env:HVAC_ALLOW_CREATE_ALL = "1"
$env:HVAC_BACNET_HOST = "127.0.0.1"
$env:HVAC_BACNET_PORT = "47808"
python scripts/stage_a_commission.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nB2 API checks (start API if healthz fails)..."
try {
    Invoke-RestMethod "$Base/healthz" -TimeoutSec 5 | Out-Null
} catch {
    Write-Host "Start API: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nB3 Connect lab BACnet + LIVE_BMS plant mode..."
Invoke-RestMethod -Method POST -Uri "$Base/api/platform/bms/connect" -ContentType "application/json" `
    -Body '{"protocol":"bacnet","host":"127.0.0.1","port":47808}' | Out-Null
Invoke-RestMethod -Method POST -Uri "$Base/api/platform/plant-mode" -ContentType "application/json" `
    -Body '{"mode":"LIVE_BMS","reason":"Phase B commission"}' | Out-Null
Start-Sleep -Seconds 8

Write-Host "`nB4 Normalized AI records..."
$norm = Invoke-RestMethod "$Base/api/platform/ai/normalized?zone_id=ZONE-01&step_seconds=60"
$recs = @($norm.records)
$live = ($recs | Where-Object { $_.source -eq "LIVE_BMS" }).Count
$good = ($recs | Where-Object { $_.quality -eq "GOOD" }).Count
Write-Host "rows=$($recs.Count) LIVE_BMS=$live GOOD=$good"
if ($recs.Count -gt 0) {
    $last = $recs[-1]
    Write-Host "last: Indoor=$($last.Indoor_Temp) Power=$($last.HVAC_Power) quality=$($last.quality) source=$($last.source)"
}

Write-Host "`nB5 Platform status..."
$snap = Invoke-RestMethod "$Base/api/platform/status"
Write-Host "plantMode=$($snap.plantMode) telemetry=$($snap.telemetry.status) source=$($snap.telemetry.source) writes=$($snap.writeEnabled) labMode=$($snap.labMode)"

Write-Host "`nPhase B lab commission OK. Map/review points at http://localhost:3000/platform/bms" -ForegroundColor Green
Write-Host "Writes remain OFF until Stage G checklist (Phase C)." -ForegroundColor Yellow
