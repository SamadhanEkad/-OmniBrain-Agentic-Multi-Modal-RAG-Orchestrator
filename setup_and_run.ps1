<#
.SYNOPSIS
    OmniBrain — One-shot install, configure, and launch script for Windows PowerShell.

.DESCRIPTION
    Sets up the local Python virtual environment, installs all unified dependencies,
    configures environment variables, and launches the FastAPI backend (and optionally
    the Streamlit frontend).

.PARAMETER WithFrontend
    Launches the Streamlit frontend UI alongside the FastAPI backend.

.PARAMETER NoInstall
    Skips dependency installation from requirements.txt.

.PARAMETER Port
    Specifies the port for the FastAPI backend (default: 8000).

.EXAMPLE
    .\setup_and_run.ps1
    .\setup_and_run.ps1 -WithFrontend
    .\setup_and_run.ps1 -NoInstall -Port 8080
#>

[CmdletBinding()]
param (
    [switch]$WithFrontend,
    [switch]$NoInstall,
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "Backend Development"
$FrontendDir = Join-Path $RepoRoot "Frontend Development"
$VenvDir = Join-Path $RepoRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"
$RequirementsFile = Join-Path $RepoRoot "requirements.txt"
$EnvExampleFile = Join-Path $RepoRoot ".env.example"
$EnvFile = Join-Path $RepoRoot ".env"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  OmniBrain: Agentic Multi-Modal RAG Platform Launcher    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Directory Structure
if (-not (Test-Path -Path $BackendDir)) {
    Write-Error "ERROR: 'Backend Development' folder not found. Please run this script from the repository root."
    exit 1
}

# 2. Virtual Environment Setup
if (-not (Test-Path -Path $VenvPython)) {
    Write-Host "==> Creating virtual environment at '$VenvDir'..." -ForegroundColor Yellow
    python -m venv $VenvDir
    if (-not (Test-Path -Path $VenvPython)) {
        Write-Error "ERROR: Failed to create virtual environment with 'python -m venv'."
        exit 1
    }
}

Write-Host "==> Virtual environment verified: $VenvPython" -ForegroundColor Green

# 3. Environment File Initialization
if (-not (Test-Path -Path $EnvFile)) {
    if (Test-Path -Path $EnvExampleFile) {
        Write-Host "==> Initializing default .env from .env.example..." -ForegroundColor Yellow
        Copy-Item -Path $EnvExampleFile -Destination $EnvFile
    }
}

# Also ensure Backend Development/.env exists if needed
$BackendEnv = Join-Path $BackendDir ".env"
if (-not (Test-Path -Path $BackendEnv) -and (Test-Path -Path $EnvFile)) {
    Copy-Item -Path $EnvFile -Destination $BackendEnv
}

# 4. Dependency Installation
if (-not $NoInstall) {
    Write-Host "==> Checking and installing dependencies from requirements.txt..." -ForegroundColor Yellow
    & $VenvPython -m pip install --upgrade pip
    if (Test-Path -Path $RequirementsFile) {
        & $VenvPip install -r $RequirementsFile
    } else {
        Write-Warning "requirements.txt not found at repository root."
    }
    Write-Host "==> Dependencies installation completed." -ForegroundColor Green
} else {
    Write-Host "==> Skipping dependency installation (-NoInstall active)." -ForegroundColor DarkGray
}

# 5. Set Environment Variables
$env:PYTHONPATH = "$BackendDir;$RepoRoot;$env:PYTHONPATH"

# 6. Launch Backend & Frontend Services
Write-Host "==> Starting FastAPI backend on http://127.0.0.1:$Port..." -ForegroundColor Cyan

$FrontendProcess = $null
if ($WithFrontend) {
    if (Test-Path -Path $FrontendDir) {
        Write-Host "==> Starting Streamlit frontend UI on http://localhost:8501..." -ForegroundColor Cyan
        $FrontendProcess = Start-Process -FilePath $VenvPython `
            -ArgumentList "-m streamlit run `"$FrontendDir\app.py`"" `
            -WorkingDirectory $FrontendDir `
            -PassThru
    } else {
        Write-Warning "Frontend directory not found at '$FrontendDir'."
    }
}

try {
    # Launch uvicorn synchronously so stdout/stderr stream directly to console
    Set-Location -Path $BackendDir
    & $VenvPython -m uvicorn main:app --reload --host 0.0.0.0 --port $Port
}
finally {
    if ($FrontendProcess -and (-not $FrontendProcess.HasExited)) {
        Write-Host "`n==> Stopping Streamlit frontend..." -ForegroundColor Yellow
        Stop-Process -Id $FrontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Set-Location -Path $RepoRoot
    Write-Host "==> OmniBrain services stopped cleanly." -ForegroundColor Green
}
