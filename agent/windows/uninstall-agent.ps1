<#
.SYNOPSIS
    Uninstalls the FamilyGuard Windows Agent background service and cleans up.
.DESCRIPTION
    Requires Administrator privileges. Stops and unregisters the FamilyGuardAgent
    Scheduled Task, and removes C:\ProgramData\FamilyGuard.
#>

[CmdletBinding()]
param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Elevating permissions to Administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$TaskName = "FamilyGuardAgent"
$InstallDir = "$env:ProgramData\FamilyGuard"

Write-Host "Stopping and removing $TaskName..." -ForegroundColor Yellow
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Terminate any running agent powershell process
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*FamilyGuardAgent.ps1*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

if (Test-Path $InstallDir) {
    Write-Host "Removing $InstallDir..." -ForegroundColor Yellow
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "FamilyGuard Agent has been completely uninstalled." -ForegroundColor Green

