# OmniBrain — Modern Web User Interface

A modern, responsive, and reactive web application interface for **OmniBrain: Agentic Multi-Modal RAG Orchestrator**. Built with React 19, Vite, Tailwind CSS v4, Lucide Icons, and Axios.

---

## 🚀 Key Features

### 1. Multi-Agent RAG Chat Workspace
- Multi-session chat conversations with Markdown formatting.
- Real-time agent routing badges indicating which specialist agent answered:
  - 🔍 **Search Agent** (`search_agent`): Vector retrieval & dense passage search
  - 📊 **SQL Agent** (`sql_agent`): Tabular database analysis & structured data queries
  - 👁️ **Vision Agent** (`vision_agent`): Image, chart, and diagram comprehension
  - 🧠 **Supervisor Agent** (`supervisor`): Synthesis and executive investment memo drafting
- Interactive **Citations Drawer** showing grounded source passages, page numbers, chunks, and similarity scores.

### 2. Document Ingestion & Management
- Drag-and-drop file upload supporting complex financial documents (10-K, 10-Q, annual reports).
- Multipart form-data streaming to `/api/v1/upload`.
- Asynchronous pipeline status polling (`/api/v1/status/{job_id}`) tracking:
  - 📄 PDF Parsing & Image Extraction
  - 🧩 Chunking & Multi-Modal Processing
  - 🔢 Embedding Generation & Vector Indexing
- Searchable indexed documents table with instant purge/deletion capabilities.

### 3. Authentication & Protected Workspaces
- JWT-based authentication supporting login, registration, and role verification (User vs. Admin).
- Token storage in `localStorage` with automated session validation and Bearer header injection via Axios interceptors.

### 4. System Health & Telemetry
- Real-time backend status badge in navigation bar.
- Dedicated System Health dashboard showing CPU, memory, uptime, and component status.
- User configuration panel for updating model preferences and API keys (`POST /api/v1/user/settings`).

---

## 🛠️ Tech Stack

- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`)
- **Icons:** Lucide React
- **HTTP Client:** Axios (centralized in `src/api/client.js`)
- **Markdown:** ReactMarkdown

---

## 🏃 Getting Started

### Prerequisites
- Node.js >= 18.0 (Node.js 24 LTS recommended)
- OmniBrain FastAPI backend running on `http://127.0.0.1:8000`

### Installation
```bash
cd frontend
npm install
```

### Development Server
```bash
npm run dev
```
The application will launch on `http://localhost:5173`.

### Production Build
```bash
npm run build
npm run preview
```

---

## 🔗 Launching with the Full Stack

You can launch both the FastAPI backend and React frontend simultaneously using the root setup scripts:

**PowerShell (Windows):**
```powershell
.\setup_and_run.ps1 -WithFrontend
```

**Bash (Linux/macOS):**
```bash
./setup_and_run.sh --with-frontend
```
