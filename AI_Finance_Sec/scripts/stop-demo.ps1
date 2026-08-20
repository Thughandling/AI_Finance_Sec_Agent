<#
.SYNOPSIS
    AI_Finance_Sec 데모 종료 스크립트 (Windows)

.DESCRIPTION
    start-demo.ps1이 기록한 .demo-logs/demo-state.json의 PID를 읽어
    터널 → 프론트 → 백엔드 순으로 정리한다.
    Ollama 서버는 기본적으로 남겨두며, -StopOllama를 주면 함께 종료한다.

.EXAMPLE
    .\scripts\stop-demo.ps1
    .\scripts\stop-demo.ps1 -StopOllama
#>
[CmdletBinding()]
param(
    [switch]$StopOllama
)

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root ".demo-logs"
$StateFile = Join-Path $LogDir "demo-state.json"

function Write-Ok([string]$Text)   { Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text){ Write-Host "  [WARN] $Text" -ForegroundColor Yellow }

Write-Host "`n=== 데모 종료 ===" -ForegroundColor Cyan

if (-not (Test-Path $StateFile)) {
    Write-Warn2 "상태 파일이 없습니다: $StateFile"
    Write-Warn2 "포트 기준으로 정리를 시도합니다."
    foreach ($port in @(3000, 8000)) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            try {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
                Write-Ok "포트 $port 점유 프로세스 종료 (PID $($c.OwningProcess))"
            } catch {
                Write-Warn2 "포트 $port 프로세스 종료 실패: $($_.Exception.Message)"
            }
        }
    }
    exit 0
}

$state = Get-Content $StateFile -Raw | ConvertFrom-Json

if ($state.publicUrl) {
    Write-Host "  내리는 공개 URL: $($state.publicUrl)" -ForegroundColor DarkGray
}

# 터널 → web → backend → ollama 순서
$order = @("tunnel", "web", "backend", "ollama")
foreach ($name in $order) {
    if ($name -eq "ollama" -and -not $StopOllama) { continue }
    foreach ($p in @($state.processes | Where-Object { $_.name -eq $name })) {
        $proc = Get-Process -Id $p.pid -ErrorAction SilentlyContinue
        if ($null -eq $proc) {
            Write-Warn2 "$name (PID $($p.pid)) 는 이미 종료됨"
            continue
        }
        try {
            Stop-Process -Id $p.pid -Force -ErrorAction Stop
            Write-Ok "$name 종료 (PID $($p.pid))"
        } catch {
            Write-Warn2 "$name 종료 실패: $($_.Exception.Message)"
        }
    }
}

# npm.cmd가 자식 node 프로세스를 남기는 경우 포트 기준으로 잔여 정리
foreach ($port in @(3000, 8000)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Ok "잔여 리스너 종료: 포트 $port (PID $($c.OwningProcess))"
        } catch {
            Write-Warn2 "포트 $port 잔여 프로세스 종료 실패"
        }
    }
}

Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Ok "정리 완료"
if (-not $StopOllama) {
    Write-Host "  Ollama 서버는 유지됩니다. 함께 내리려면: .\scripts\stop-demo.ps1 -StopOllama" -ForegroundColor DarkGray
}
Write-Host ""
