#!/usr/bin/env bash
#
# OmniBrain — one-shot install + run
#
# Run this from the REPO ROOT (the folder containing "Backend Development/", "frontend/", and "Frontend Development/"):
#
#     chmod +x setup_and_run.sh
#     ./setup_and_run.sh
#
# What it does:
#   1. Creates/activates a local virtualenv (.venv)
#   2. Finds and installs EVERY requirements*.txt in the repo
#   3. Installs extra runtime dependencies if missing
#   4. Installs npm dependencies in frontend/ if requested
#   5. Starts the FastAPI backend with uvicorn (and optional frontends)
#
# Flags:
#   ./setup_and_run.sh --with-frontend    launches modern React frontend alongside FastAPI
#   ./setup_and_run.sh --with-react       explicitly launches Vite React frontend
#   ./setup_and_run.sh --with-streamlit   launches legacy Streamlit UI
#   ./setup_and_run.sh --no-install       skip dependency installs
#   ./setup_and_run.sh --port 9000        run backend on a custom port
#

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

BACKEND_DIR="Backend Development"
REACT_DIR="frontend"
STREAMLIT_DIR="Frontend Development"
PORT=8000
REACT_PORT=5173
WITH_REACT=0
WITH_STREAMLIT=0
DO_INSTALL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-frontend|--with-react) WITH_REACT=1; shift ;;
    --with-streamlit)            WITH_STREAMLIT=1; shift ;;
    --no-install)                DO_INSTALL=0; shift ;;
    --port)                      PORT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "ERROR: '$BACKEND_DIR' not found. Run this script from the repo root."
  exit 1
fi

# ---------------------------------------------------------------------
# 1. Virtualenv
# ---------------------------------------------------------------------
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [[ ! -d ".venv" ]]; then
  echo "==> Creating virtualenv (.venv)..."
  "$PYTHON_BIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate

echo "==> Using $(python --version) at $(which python)"

if [[ "$DO_INSTALL" -eq 1 ]]; then
  python -m pip install --upgrade pip

  echo "==> Discovering requirements files..."
  REQ_FILES=$(find . -iname "requirement*.txt" -not -path "./.venv/*" -not -path "./.git/*")

  if [[ -z "$REQ_FILES" ]]; then
    echo "   (none found)"
  else
    while IFS= read -r req; do
      echo "   installing from: $req"
      python -m pip install -r "$req"
    done <<< "$REQ_FILES"
  fi

  echo "==> Installing packages used in code..."
  EXTRA_PACKAGES=(
    "fastapi>=0.110.0"
    "uvicorn[standard]>=0.27.0"
    "python-multipart>=0.0.9"
    "websockets>=12.0"
    "python-jose[cryptography]>=3.3.0"
    "passlib[bcrypt]>=1.7.4"
    "langgraph>=0.2.0"
    "streamlit>=1.35.0"
    "requests>=2.31.0"
  )
  python -m pip install "${EXTRA_PACKAGES[@]}"

  # Check npm dependencies for React
  if [[ "$WITH_REACT" -eq 1 && -d "$REACT_DIR" && ! -d "$REACT_DIR/node_modules" ]]; then
    echo "==> Installing Node.js frontend dependencies..."
    (cd "$REACT_DIR" && npm install)
  fi

  echo "==> Install complete."
fi

# Cleanup on exit
PIDS=()
cleanup() {
  echo "==> Stopping services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------
# 2. Launch Frontends (Optional)
# ---------------------------------------------------------------------
if [[ "$WITH_REACT" -eq 1 && -d "$REACT_DIR" ]]; then
  echo "==> Starting modern React frontend UI on http://localhost:$REACT_PORT..."
  (
    cd "$REACT_DIR"
    exec npm run dev -- --port "$REACT_PORT"
  ) &
  PIDS+=($!)
fi

if [[ "$WITH_STREAMLIT" -eq 1 && -d "$STREAMLIT_DIR" ]]; then
  echo "==> Starting Streamlit frontend on http://localhost:8501..."
  streamlit run "$STREAMLIT_DIR/app.py" &
  PIDS+=($!)
fi

# ---------------------------------------------------------------------
# 3. Start the backend
# ---------------------------------------------------------------------
echo "==> Starting FastAPI backend on port $PORT..."
(
  cd "$BACKEND_DIR"
  exec python -m uvicorn main:app --reload --host 0.0.0.0 --port "$PORT"
) &
BACKEND_PID=$!
PIDS+=($BACKEND_PID)

wait "$BACKEND_PID"