import React, { useState, useEffect } from 'react';
import { documentsApi } from '../api/client';
import {
  FileText,
  Trash2,
  RefreshCw,
  Clock,
  Layers,
  CheckCircle,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

export default function DocumentList({ refreshTrigger }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await documentsApi.list();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError('Could not load indexed documents from the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [refreshTrigger]);

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Are you sure you want to purge '${title}' from the database and vector store?`)) {
      return;
    }

    setDeletingId(docId);
    try {
      await documentsApi.deleteDoc(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert('Failed to delete document: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-indigo-400" />
            <span>Indexed Knowledge Base</span>
          </h3>
          <p className="text-xs text-slate-400">
            Real-time vector documents available for the LangGraph agent orchestrator.
          </p>
        </div>

        <button
          onClick={fetchDocuments}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
          title="Refresh Documents"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Document Grid / Table */}
      {loading && documents.length === 0 ? (
        <div className="flex h-36 items-center justify-center text-xs text-slate-500">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
          Loading document catalog...
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500">
          <FileText className="mb-2 h-8 w-8 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">No documents indexed yet</p>
          <p className="mt-1 text-xs text-slate-600">
            Upload your first financial PDF or report using the intake dropzone above.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 transition hover:bg-slate-900/40 gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">{doc.title || 'Untitled Document'}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-slate-500" />
                      {doc.chunk_count || 0} chunks embedded
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Recent'}
                    </span>
                    <span>•</span>
                    <span className="rounded uppercase bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                      {doc.file_type || 'PDF'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                  <CheckCircle className="h-3 w-3" />
                  <span>{doc.status || 'Indexed'}</span>
                </span>

                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  disabled={deletingId === doc.id}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                  title="Purge Document"
                >
                  <Trash2 className={`h-4 w-4 ${deletingId === doc.id ? 'animate-pulse text-rose-500' : ''}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
