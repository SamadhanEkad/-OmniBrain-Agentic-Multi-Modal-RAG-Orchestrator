import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, User, Mail, Shield, AlertCircle, ArrowRight } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const { login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegisterMode) {
        await register(username, password, email || undefined, role);
      } else {
        await login(username, password);
      }
      onClose();
    } catch (err) {
      console.error('Auth error:', err);
      const msg = err.response?.data?.detail || err.message || 'Authentication failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {isRegisterMode ? 'Create OmniBrain Account' : 'Welcome Back'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {isRegisterMode
              ? 'Register to index documents and launch agentic RAG workflows'
              : 'Sign in to access your chat history and knowledge bases'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <User className="h-4 w-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. samadhan"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isRegisterMode && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@omnibrain.ai"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isRegisterMode && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Role Permission</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Shield className="h-4 w-4" />
                </div>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="user">User (Standard Analyst)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>{isRegisterMode ? 'Complete Registration' : 'Sign In to Workspace'}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Mode Switcher */}
        <div className="mt-6 text-center text-xs text-slate-400">
          {isRegisterMode ? (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setError(null);
                }}
                className="font-medium text-indigo-400 hover:text-indigo-300"
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Need an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(true);
                  setError(null);
                }}
                className="font-medium text-indigo-400 hover:text-indigo-300"
              >
                Register here
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
