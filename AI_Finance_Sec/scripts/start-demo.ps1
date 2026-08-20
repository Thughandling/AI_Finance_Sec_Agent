<#
.SYNOPSIS
    AI_Finance_Sec 실시간 데모 기동 스크립트 (Windows)

.DESCRIPTION
    Ollama(로컬 오픈소스 경량 모델) + FastAPI/LangGraph + Next 프론트를 한 번에 띄우고,
    Cloudflare Quick Tunnel로 공개 https URL을 발급한다.
    로컬 모델 경로와 BYOK(사용자 API 키) 경로가 동시에 동작한다.

.EXAMPLE
    .\scripts\start-demo.ps1
    .\scripts\start-demo.ps1 -Model qwen2.5:1.5b
    .\scripts\start-demo.ps1 -SkipTunnel
    .\scripts\start-demo.ps1 -Dev
#>
[CmdletBinding()]
param(
    [string]$Model = "qwen2.5:3b",
    [int]$WebPort = 3000,
    [int]$ApiPort = 8000,
    [int]$OllamaTimeoutSeconds = 120,
    [switch]$SkipTunnel,
    [switch]$Dev,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root ".demo-logs"
$StateFile = Join-Path $LogDir "demo-state.json"
$OllamaBase = "http://127.0.0.1:11434"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Step([string]$Text) { Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text){ Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "  [FAIL] $Text" -ForegroundColor Red }

function Test-Endpoint([string]$Url, [int]$TimeoutSec = 3) {
    try {
        Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-Endpoint([string]$Url, [int]$MaxSeconds, [string]$Label) {
    $elapsed = 0
    while ($elapsed -lt $MaxSeconds) {
        if (Test-Endpoint $Url) { return $true }
        Start-Sleep -Seconds 2
        $elapsed += 2
        Write-Host "  ... $Label 대기 ${elapsed}s" -ForegroundColor DarkGray
    }
    return $false
}

# PATH 등록이 새 세션에서만 반영되는 도구가 있으므로 기본 설치 경로도 함께 확인한다.
function Resolve-Tool([string]$Name, [string[]]$Candidates) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($c in $Candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

$tracked = @()

# --------------------------------------------------------------------------
Write-Step "0. 사전 점검"

Set-Location $Root
Write-Ok "프로젝트 루트: $Root"

$venvPython = Join-Path $Root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Fail "백엔드 가상환경이 없습니다: $venvPython"
    Write-Host "    python -m venv backend\.venv" -ForegroundColor Yellow
    Write-Host "    .\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt" -ForegroundColor Yellow
    exit 1
}
Write-Ok "venv Python 확인"

$ollamaExe = Resolve-Tool "ollama" @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
)
if (-not $ollamaExe) {
    Write-Fail "ollama 실행 파일을 찾을 수 없습니다. winget install --id Ollama.Ollama -e"
    exit 1
}
Write-Ok "ollama 확인: $ollamaExe"

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Fail "node_modules 없음. 먼저 'npm install'을 실행하세요."
    exit 1
}
Write-Ok "node_modules 확인"

# --------------------------------------------------------------------------
Write-Step "1. Ollama 서버"

if (Test-Endpoint "$OllamaBase/api/tags") {
    Write-Ok "Ollama가 이미 실행 중입니다."
} else {
    Write-Host "  Ollama 서버를 시작합니다..." -ForegroundColor DarkGray
    $ollamaProc = Start-Process -FilePath $ollamaExe -ArgumentList "serve" `
        -RedirectStandardOutput (Join-Path $LogDir "ollama.out.log") `
        -RedirectStandardError  (Join-Path $LogDir "ollama.err.log") `
        -WindowStyle Hidden -PassThru
    $tracked += [pscustomobject]@{ name = "ollama"; pid = $ollamaProc.Id }
    if (-not (Wait-Endpoint "$OllamaBase/api/tags" 40 "Ollama")) {
        Write-Fail "Ollama 서버가 기동되지 않았습니다. $LogDir\ollama.err.log 확인"
        exit 1
    }
    Write-Ok "Ollama 기동 완료 (PID $($ollamaProc.Id))"
}

# --------------------------------------------------------------------------
Write-Step "2. 로컬 경량 모델: $Model"

$tags = Invoke-RestMethod -Uri "$OllamaBase/api/tags" -TimeoutSec 10
$have = @($tags.models | Where-Object { $_.name -eq $Model -or $_.name -eq ($Model + ":latest") })
if ($have.Count -gt 0) {
    Write-Ok "모델이 이미 준비되어 있습니다."
} else {
    Write-Host "  모델을 내려받습니다 (최초 1회, 수 분 소요)..." -ForegroundColor DarkGray
    & $ollamaExe pull $Model
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "모델 pull 실패: $Model"
        exit 1
    }
    Write-Ok "모델 준비 완료"
}

# --------------------------------------------------------------------------
Write-Step "3. 환경 변수"

$env:OLLAMA_BASE_URL        = $OllamaBase
$env:OLLAMA_MODEL           = $Model
$env:OLLAMA_TIMEOUT_SECONDS = "$OllamaTimeoutSeconds"
$env:FASTAPI_BASE_URL       = "http://127.0.0.1:$ApiPort"
$env:PORT                   = "$WebPort"

Write-Ok "OLLAMA_MODEL=$Model"
Write-Ok "OLLAMA_TIMEOUT_SECONDS=$OllamaTimeoutSeconds (CPU 추론 여유)"
Write-Ok "FASTAPI_BASE_URL=$($env:FASTAPI_BASE_URL)"

# --------------------------------------------------------------------------
Write-Step "4. FastAPI + LangGraph 백엔드 (:$ApiPort)"

if (Test-Endpoint "http://127.0.0.1:$ApiPort/health") {
    Write-Warn2 "이미 :$ApiPort 에서 백엔드가 응답합니다. 기존 프로세스를 재사용합니다."
} else {
    $apiProc = Start-Process -FilePath $venvPython `
        -ArgumentList "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "$ApiPort" `
        -WorkingDirectory $Root `
        -RedirectStandardOutput (Join-Path $LogDir "backend.out.log") `
        -RedirectStandardError  (Join-Path $LogDir "backend.err.log") `
        -WindowStyle Hidden -PassThru
    $tracked += [pscustomobject]@{ name = "backend"; pid = $apiProc.Id }
    if (-not (Wait-Endpoint "http://127.0.0.1:$ApiPort/health" 60 "FastAPI")) {
        Write-Fail "백엔드 기동 실패. $LogDir\backend.err.log 확인"
        exit 1
    }
    Write-Ok "백엔드 기동 완료 (PID $($apiProc.Id))"
}

$health = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/health" -TimeoutSec 10
Write-Ok "health: status=$($health.status) model=$($health.model)"

# --------------------------------------------------------------------------
Write-Step "5. 프론트엔드 (:$WebPort)"

$npmCmd = "npm.cmd"
if (-not $Dev -and -not $SkipBuild) {
    Write-Host "  프로덕션 빌드 중..." -ForegroundColor DarkGray
    & $npmCmd run build:win
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "빌드 실패. -Dev 스위치로 개발 서버를 시도해 보세요."
        exit 1
    }
    Write-Ok "빌드 완료"
}

if ($Dev) { $webScript = "dev:win" } else { $webScript = "start:win" }

$webProc = Start-Process -FilePath $npmCmd -ArgumentList "run", $webScript `
    -WorkingDirectory $Root `
    -RedirectStandardOutput (Join-Path $LogDir "web.out.log") `
    -RedirectStandardError  (Join-Path $LogDir "web.err.log") `
    -WindowStyle Hidden -PassThru
$tracked += [pscustomobject]@{ name = "web"; pid = $webProc.Id }

if (-not (Wait-Endpoint "http://localhost:$WebPort" 120 "Next")) {
    Write-Fail "프론트엔드 기동 실패. $LogDir\web.err.log 확인"
    exit 1
}
Write-Ok "프론트엔드 기동 완료 (PID $($webProc.Id)) - npm run $webScript"

# --------------------------------------------------------------------------
$publicUrl = ""
if (-not $SkipTunnel) {
    Write-Step "6. Cloudflare Quick Tunnel (공개 URL)"

    $cfExe = Resolve-Tool "cloudflared" @(
        (Join-Path $Root "tools\cloudflared.exe"),
        (Join-Path $env:ProgramFiles "cloudflared\cloudflared.exe")
    )
    if (-not $cfExe) {
        Write-Warn2 "cloudflared 미설치 - 공개 URL을 건너뜁니다."
        Write-Warn2 "해결: tools\cloudflared.exe 로 독립 실행 바이너리를 내려받으세요."
    } else {
        Write-Ok "cloudflared 확인: $cfExe"
        $tunnelLog = Join-Path $LogDir "tunnel.log"
        foreach ($f in @($tunnelLog, (Join-Path $LogDir "tunnel.err.log"), (Join-Path $LogDir "tunnel.out.log"))) {
            if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
        }

        $cfProc = Start-Process -FilePath $cfExe `
            -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://localhost:$WebPort", "--logfile", $tunnelLog `
            -RedirectStandardOutput (Join-Path $LogDir "tunnel.out.log") `
            -RedirectStandardError  (Join-Path $LogDir "tunnel.err.log") `
            -WindowStyle Hidden -PassThru
        $tracked += [pscustomobject]@{ name = "tunnel"; pid = $cfProc.Id }

        $elapsed = 0
        while ($elapsed -lt 90 -and -not $publicUrl) {
            Start-Sleep -Seconds 3
            $elapsed += 3
            foreach ($f in @($tunnelLog, (Join-Path $LogDir "tunnel.err.log"), (Join-Path $LogDir "tunnel.out.log"))) {
                if (Test-Path $f) {
                    $text = Get-Content $f -Raw -ErrorAction SilentlyContinue
                    if ($text -and $text -match "https://[a-z0-9-]+\.trycloudflare\.com") {
                        $publicUrl = $Matches[0]
                        break
                    }
                }
            }
            if (-not $publicUrl) { Write-Host "  ... 터널 URL 대기 ${elapsed}s" -ForegroundColor DarkGray }
        }

        if ($publicUrl) {
            Write-Ok "공개 URL 발급: $publicUrl"
        } else {
            Write-Warn2 "터널 URL을 확인하지 못했습니다. $tunnelLog 를 직접 확인하세요."
        }
    }
}

# --------------------------------------------------------------------------
$state = [pscustomobject]@{
    startedAt = (Get-Date).ToString("s")
    model     = $Model
    webUrl    = "http://localhost:$WebPort"
    apiUrl    = "http://127.0.0.1:$ApiPort"
    publicUrl = $publicUrl
    processes = $tracked
}
$state | ConvertTo-Json -Depth 5 | Out-File -FilePath $StateFile -Encoding utf8

Write-Step "기동 완료"
Write-Host ""
Write-Host "  로컬 화면      : http://localhost:$WebPort" -ForegroundColor White
Write-Host "  백엔드 health  : http://127.0.0.1:$ApiPort/health" -ForegroundColor White
Write-Host "  백엔드 docs    : http://127.0.0.1:$ApiPort/docs" -ForegroundColor White
if ($publicUrl) {
    Write-Host "  공개 URL       : $publicUrl" -ForegroundColor Green
}
Write-Host ""
Write-Host "  로컬 모델 시연 : 우측 상단 설정 > 'Ollama Local' 선택 ($Model)" -ForegroundColor White
Write-Host "  BYOK 시연      : 설정 > OpenAI/DeepSeek/Claude/Gemini/Qwen + 본인 API 키" -ForegroundColor White
Write-Host ""
Write-Host "  로그           : $LogDir" -ForegroundColor DarkGray
Write-Host "  종료           : .\scripts\stop-demo.ps1" -ForegroundColor DarkGray
Write-Host ""
if ($publicUrl) {
    Write-Warn2 "공개 URL은 인터넷에 노출됩니다. 시연이 끝나면 stop-demo.ps1로 반드시 내리세요."
}
