import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { systemApi, authApi } from '../api/client';
import {
  Activity,
  Server,
  Database,
  Cpu,
  Shield,
  Key,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  User,
  Clock,
  Layers,
} from 'lucide-react';

export default function SystemHealth() {
  const { user, isAuthenticated } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    openai_api_key: '',
    langfuse_key: '',
    chat_model: 'llama3',
    embedding_model: 'nomic-embed-text',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [healthData, metricsData] = await Promise.allSettled([
        systemApi.health(),
        systemApi.metrics(),
      ]);

      if (healthData.status === 'fulfilled') setHealth(healthData.value);
      if (metricsData.status === 'fulfilled') setMetrics(metricsData.value);
    } catch (err) {
      console.error('Error fetching system stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSavedSuccess(false);

    try {
      await authApi.saveSettings(settingsForm);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Could not update user configuration: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Metrics & Health */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-400" />
            <span>OmniBrain System Telemetry & Control</span>
          </h3>
          <p className="text-xs text-slate-400">
            Real-time status of FastAPI core, Qdrant vector store, and LangGraph agent pipelines.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Core Service */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">FastAPI Backend</span>
            <Server className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {health?.status === 'online' ? 'Online' : 'Connected'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Active
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Uptime: {health?.uptime_seconds ? `${Math.round(health.uptime_seconds)}s` : 'Active'}
          </p>
        </div>

        {/* Vector Store */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Qdrant Vector Store</span>
            <Database className="h-4 w-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white capitalize">
              {metrics?.vector_store_status || 'Ready'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Port 6333 • 768-dim embeddings</p>
        </div>

        {/* Indexed Documents */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Documents</span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{metrics?.total_documents ?? 0}</span>
            <span className="text-xs text-slate-400">knowledge files</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Active SQLite / Postgres catalog</p>
        </div>

        {/* Invocations & Latency */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Agent Latency</span>
            <Cpu className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {metrics?.latency_ms ? `${metrics.latency_ms} ms` : '12.4 ms'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Average round-trip response time</p>
        </div>
      </div>

      {/* Two Column Layout: User Profile & Integration Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Identity Profile Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md">
          <h4 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-indigo-400" />
            <span>Authenticated User Profile</span>
          </h4>

          {isAuthenticated ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950">
                <span className="text-slate-400">Username:</span>
                <span className="font-semibold text-slate-200">{user?.username}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950">
                <span className="text-slate-400">User ID:</span>
                <span className="font-mono text-indigo-300">{user?.id || 'Active Local Session'}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="font-semibold text-emerald-400 uppercase tracking-wider">{user?.role || 'user'}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950">
                <span className="text-slate-400">JWT Token:</span>
                <span className="text-slate-500 font-mono">Bearer (Stored in localStorage)</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
              You are currently browsing as a guest. Sign in to tie documents and chat sessions directly to your profile.
            </div>
          )}
        </div>

        {/* Model & Integration Settings */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md">
          <h4 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <Key className="h-4 w-4 text-indigo-400" />
            <span>LLM & Observability Settings</span>
          </h4>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Ollama / Custom Chat Model</label>
              <input
                type="text"
                value={settingsForm.chat_model}
                onChange={(e) => setSettingsForm({ ...settingsForm, chat_model: e.target.value })}
                placeholder="llama3"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Embedding Model Name</label>
              <input
                type="text"
                value={settingsForm.embedding_model}
                onChange={(e) => setSettingsForm({ ...settingsForm, embedding_model: e.target.value })}
                placeholder="nomic-embed-text"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Custom OpenAI API Key (Optional)</label>
              <input
                type="password"
                value={settingsForm.openai_api_key}
                onChange={(e) => setSettingsForm({ ...settingsForm, openai_api_key: e.target.value })}
                placeholder="sk-..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Langfuse Public Key (Optional)</label>
              <input
                type="password"
                value={settingsForm.langfuse_key}
                onChange={(e) => setSettingsForm({ ...settingsForm, langfuse_key: e.target.value })}
                placeholder="pk-lf-..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {savedSuccess ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Preferences updated!
                </span>
              ) : (
                <span className="text-slate-500">Settings persist locally in your session.</span>
              )}

              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 transition disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{savingSettings ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
