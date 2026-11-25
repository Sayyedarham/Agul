<#
.SYNOPSIS
    Builds a standalone zero-click FamilyGuard installer for a child's PC.
.DESCRIPTION
    Injects the server URL and one-time enrollment code into the binary at compile time.
    When the child double-clicks the resulting .exe, it auto-enrolls, starts the service,
    and requests no input.
.EXAMPLE
    .\build-agent.ps1 -Server "http://192.168.1.50:3000" -Code "8F4B-92E1" -Nickname "Leo's Laptop"
#>
param(
    [Parameter(Mandatory=$false)]
    [string]$Server = "http://localhost:3000",

    [Parameter(Mandatory=$false)]
    [string]$Code = "",

    [Parameter(Mandatory=$false)]
    [string]$Nickname = "",

    [Parameter(Mandatory=$false)]
    [string]$Output = "FamilyGuardSetup.exe"
)

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $AgentDir

Write-Host "Building FamilyGuard Agent..." -ForegroundColor Cyan
Write-Host "  Server:   $Server"
Write-Host "  Code:     $Code"
Write-Host "  Nickname: $(if ($Nickname) { $Nickname } else { '(auto-detect hostname)' })"
Write-Host "  Output:   $Output"

$ldflags = "-H=windowsgui -s -w"
if ($Server) {
    $ldflags += " -X main.defaultServerUrl=$Server"
}
if ($Code) {
    $ldflags += " -X main.defaultCode=$Code"
}
if ($Nickname) {
    $ldflags += " -X main.defaultNickname=$Nickname"
}

go build -ldflags $ldflags -o $Output main.go

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Built $Output successfully!" -ForegroundColor Green
    Write-Host "Send this $Output file to the child's PC. Double-clicking it will auto-enroll with zero prompts." -ForegroundColor Yellow
} else {
    Write-Host "`n[ERROR] Build failed." -ForegroundColor Red
}

Pop-Location
