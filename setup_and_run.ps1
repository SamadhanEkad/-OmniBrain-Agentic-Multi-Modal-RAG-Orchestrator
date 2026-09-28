<#
.SYNOPSIS
    OmniBrain — One-shot install, configure, and launch script for Windows PowerShell.

.DESCRIPTION
    Sets up the local Python virtual environment, installs all unified dependencies,
    configures environment variables, and launches the FastAPI backend (and optionally
    the modern React web frontend or legacy Streamlit UI).

.PARAMETER WithFrontend
    Launches the modern React frontend UI alongside the FastAPI backend.

.PARAMETER WithReact
    Explicitly launches the Vite React frontend on http://localhost:5173.

.PARAMETER WithStreamlit
    Launches the legacy Streamlit frontend UI on http://localhost:8501.

.PARAMETER NoInstall
    Skips dependency installation from requirements.txt and package.json.

.PARAMETER Port
    Specifies the port for the FastAPI backend (default: 8000).

.PARAMETER ReactPort
    Specifies the port for the React frontend (default: 5173).

.EXAMPLE
    .\setup_and_run.ps1
    .\setup_and_run.ps1 -WithFrontend
    .\setup_and_run.ps1 -WithReact
    .\setup_and_run.ps1 -WithStreamlit
    .\setup_and_run.ps1 -NoInstall -Port 8080
#>

[CmdletBinding()]
param (
    [switch]$WithFrontend,
    [switch]$WithReact,
    [switch]$WithStreamlit,
    [switch]$NoInstall,
    [int]$Port = 8000,
    [int]$ReactPort = 5173
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "Backend Development"
$ReactDir = Join-Path $RepoRoot "frontend"
$StreamlitDir = Join-Path $RepoRoot "Frontend Development"
$VenvDir = Join-Path $RepoRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"
$RequirementsFile = Join-Path $RepoRoot "requirements.txt"
$EnvExampleFile = Join-Path $RepoRoot ".env.example"
$EnvFile = Join-Path $RepoRoot ".env"

# Resolve Node.js path if installed via winget or custom location
$WingetNodeDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"
if (Test-Path $WingetNodeDir) {
    $env:Path = "$WingetNodeDir;$env:Path"
}

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
    Write-Host "==> Checking and installing Python dependencies from requirements.txt..." -ForegroundColor Yellow
    & $VenvPython -m pip install --upgrade pip
    if (Test-Path -Path $RequirementsFile) {
        & $VenvPip install -r $RequirementsFile
    } else {
        Write-Warning "requirements.txt not found at repository root."
    }
    Write-Host "==> Python dependencies installation completed." -ForegroundColor Green

    # Install Frontend npm dependencies if React frontend is requested
    if (($WithFrontend -or $WithReact) -and (Test-Path -Path $ReactDir)) {
        $NodeModulesDir = Join-Path $ReactDir "node_modules"
        if (-not (Test-Path -Path $NodeModulesDir)) {
            Write-Host "==> Installing Node.js frontend dependencies..." -ForegroundColor Yellow
            $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)?.Source ?? "npm"
            Start-Process -FilePath $npmCmd -ArgumentList "install" -WorkingDirectory $ReactDir -NoNewWindow -Wait
            Write-Host "==> Frontend dependencies installed." -ForegroundColor Green
        }
    }
} else {
    Write-Host "==> Skipping dependency installation (-NoInstall active)." -ForegroundColor DarkGray
}

# 5. Set Environment Variables
$env:PYTHONPATH = "$BackendDir;$RepoRoot;$env:PYTHONPATH"

# 6. Launch Backend & Frontend Services
$ReactProcess = $null
$StreamlitProcess = $null

# Launch React Frontend
if (($WithFrontend -or $WithReact) -and (Test-Path -Path $ReactDir)) {
    Write-Host "==> Starting modern React frontend UI on http://localhost:$ReactPort..." -ForegroundColor Cyan
    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)?.Source ?? "npm"
    $ReactProcess = Start-Process -FilePath $npmCmd `
        -ArgumentList "run dev -- --port $ReactPort" `
        -WorkingDirectory $ReactDir `
        -PassThru
}

# Launch Streamlit Frontend (if explicitly requested)
if ($WithStreamlit -and (Test-Path -Path $StreamlitDir)) {
    Write-Host "==> Starting Streamlit frontend UI on http://localhost:8501..." -ForegroundColor Cyan
    $StreamlitProcess = Start-Process -FilePath $VenvPython `
        -ArgumentList "-m streamlit run `"$StreamlitDir\app.py`"" `
        -WorkingDirectory $StreamlitDir `
        -PassThru
}

Write-Host "==> Starting FastAPI backend on http://127.0.0.1:$Port..." -ForegroundColor Cyan

try {
    # Launch uvicorn synchronously so stdout/stderr stream directly to console
    Set-Location -Path $BackendDir
    & $VenvPython -m uvicorn main:app --reload --host 0.0.0.0 --port $Port
}
finally {
    if ($ReactProcess -and (-not $ReactProcess.HasExited)) {
        Write-Host "`n==> Stopping React frontend..." -ForegroundColor Yellow
        Stop-Process -Id $ReactProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($StreamlitProcess -and (-not $StreamlitProcess.HasExited)) {
        Write-Host "`n==> Stopping Streamlit frontend..." -ForegroundColor Yellow
        Stop-Process -Id $StreamlitProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Set-Location -Path $RepoRoot
    Write-Host "==> OmniBrain services stopped cleanly." -ForegroundColor Green
}
