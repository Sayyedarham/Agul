<#
.SYNOPSIS
    Builds the standalone FamilyGuardSetup.exe for Windows.
.DESCRIPTION
    Compiles the native Go agent with a hidden Windows GUI subsystem.
    The resulting FamilyGuardSetup.exe can be distributed to other Windows PCs.
    When double-clicked by an admin:
      1. Automatically requests Administrator elevation.
      2. Displays a clean graphical setup dialog (Server URL, Enrollment Code, Nickname).
      3. Connects and enrolls the PC with your FamilyGuard Server.
      4. Installs itself to C:\ProgramData\FamilyGuard\FamilyGuardAgent.exe.
      5. Registers and starts the Windows Scheduled Task to run continuously in the background at boot and logon.
#>

$ErrorActionPreference = "Stop"

Write-Host "Building FamilyGuardSetup.exe..." -ForegroundColor Cyan

$agentDir = Join-Path $PSScriptRoot "agent"
$outputExe = Join-Path $PSScriptRoot "FamilyGuardSetup.exe"

Push-Location $agentDir
try {
    go build -ldflags "-H windowsgui -s -w" -o $outputExe main.go
} finally {
    Pop-Location
}

if (Test-Path $outputExe) {
    $sizeMb = [math]::Round((Get-Item $outputExe).Length / 1MB, 2)
    Write-Host "Success! Created standalone executable:" -ForegroundColor Green
    Write-Host "Path: $outputExe ($sizeMb MB)" -ForegroundColor Yellow
    Write-Host "You can now send this file to any Windows PC to install with a simple double-click!" -ForegroundColor Green
} else {
    Write-Error "Build failed. Ensure Go is installed and in your PATH."
}

