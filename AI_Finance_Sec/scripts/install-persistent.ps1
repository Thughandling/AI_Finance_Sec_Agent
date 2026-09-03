<#
.SYNOPSIS
    로컬 풀스택 데모를 재부팅·로그아웃에도 살아 있게 작업 스케줄러에 등록한다.

.DESCRIPTION
    "AI_Finance_Sec_Demo" 작업을 만든다:
      - 시스템 부팅 시 자동 시작 (사용자 로그인 불필요)
      - start-demo.ps1 -Watch 로 상주하며 죽은 서비스 자동 재기동
      - 작업이 죽으면 1분 뒤 재시작, 무제한 재시도
    Cloudflare Quick Tunnel 주소는 재기동마다 바뀐다. 고정 공개 URL이 필요하면
    Cloudflare Workers 배포(DEPLOY.md)나 named tunnel을 쓴다.

    관리자 PowerShell에서 실행해야 한다.

.EXAMPLE
    .\scripts\install-persistent.ps1
    .\scripts\install-persistent.ps1 -SkipTunnel
    .\scripts\install-persistent.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [string]$TaskName = "AI_Finance_Sec_Demo",
    [string]$Model = "qwen2.5:3b",
    [switch]$SkipTunnel,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "관리자 권한 PowerShell에서 실행하세요."
    exit 1
}

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "  [OK] '$TaskName' 제거됨" -ForegroundColor Green
    exit 0
}

$Root      = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $Root "scripts\start-demo.ps1"
if (-not (Test-Path $StartScript)) { Write-Error "start-demo.ps1 없음: $StartScript"; exit 1 }

$argList = "-ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File `"$StartScript`" -Watch -Model $Model"
if ($SkipTunnel) { $argList += " -SkipTunnel" }

$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argList -WorkingDirectory $Root
$trigger  = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null

$stateFile = Join-Path $Root ".demo-logs\demo-state.json"
Write-Host "  [OK] '$TaskName' 등록 완료 (부팅 시 자동 시작, 1분 간격 재시도)" -ForegroundColor Green
Write-Host "       지금 즉시 시작 : Start-ScheduledTask -TaskName $TaskName" -ForegroundColor DarkGray
Write-Host "       상태 확인      : Get-ScheduledTaskInfo -TaskName $TaskName" -ForegroundColor DarkGray
Write-Host "       공개 URL       : (Get-Content '$stateFile' -Raw | ConvertFrom-Json).publicUrl" -ForegroundColor DarkGray
Write-Host "       제거           : .\scripts\install-persistent.ps1 -Uninstall" -ForegroundColor DarkGray
