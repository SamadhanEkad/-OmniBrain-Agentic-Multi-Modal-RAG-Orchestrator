import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { systemApi } from '../api/client';
import {
  Brain,
  MessageSquare,
  FileText,
  Activity,
  LogOut,
  LogIn,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onOpenAuth }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [backendStatus, setBackendStatus] = useState('checking'); // 'online' | 'offline' | 'checking'

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        await systemApi.health();
        if (isMounted) setBackendStatus('online');
      } catch {
        if (isMounted) setBackendStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div
          onClick={() => setActiveTab('chat')}
          className="flex cursor-pointer items-center gap-3 transition-opacity hover:opacity-90"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/20">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">OmniBrain</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
                Agentic RAG
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Multi-Modal Financial Intelligence</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Chat Workspace</span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Documents & Ingestion</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeTab === 'system'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>System Health</span>
          </button>
        </nav>

        {/* Right Section: System Status & User Profile */}
        <div className="flex items-center gap-3">
          {/* Health indicator */}
          <div
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium md:flex border ${
              backendStatus === 'online'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : backendStatus === 'offline'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}
            title={`Backend Status: ${backendStatus}`}
          >
            {backendStatus === 'online' && <CheckCircle className="h-3 w-3 text-emerald-400" />}
            {backendStatus === 'offline' && <AlertTriangle className="h-3 w-3 text-rose-400" />}
            <span className="capitalize">{backendStatus === 'online' ? 'FastAPI Online' : backendStatus}</span>
          </div>

          {/* User Profile or Login Trigger */}
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold text-slate-200 flex items-center gap-1 justify-end">
                  {user?.username || 'User'}
                  {user?.role === 'admin' && (
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-400" title="Admin User" />
                  )}
                </span>
                <span className="text-xs text-slate-500 capitalize">{user?.role || 'user'}</span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
