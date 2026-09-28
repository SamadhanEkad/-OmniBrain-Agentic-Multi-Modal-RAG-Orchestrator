import React, { useState, useRef } from 'react';
import { documentsApi } from '../api/client';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Cpu,
  Database,
  Sparkles,
} from 'lucide-react';

export default function DocumentUpload({ onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState(null); // { job_id, status, progress, filename, error }
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (file) => {
    setError(null);
    setJobStatus(null);
    setSelectedFile(file);
  };

  const pollJobStatus = async (jobId) => {
    const interval = setInterval(async () => {
      try {
        const statusData = await documentsApi.getStatus(jobId);
        setJobStatus(statusData);

        if (statusData.status === 'completed') {
          clearInterval(interval);
          setIsProcessing(false);
          if (onUploadSuccess) onUploadSuccess();
        } else if (statusData.status === 'failed') {
          clearInterval(interval);
          setIsProcessing(false);
          setError(statusData.error || 'Ingestion failed during processing.');
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    }, 1500);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setError(null);
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const response = await documentsApi.uploadFile(selectedFile, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });

      if (response && response.job_id) {
        setJobStatus({
          job_id: response.job_id,
          status: 'queued',
          progress: 10,
          filename: response.filename,
        });
        pollJobStatus(response.job_id);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.detail || err.message || 'File upload failed.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-indigo-400" />
          <span>Multi-Modal Document Intake</span>
        </h3>
        <p className="text-xs text-slate-400">
          Upload financial PDFs, earnings reports, or balance sheets for VLM table parsing, chunking, and Qdrant vector storage.
        </p>
      </div>

      {/* Drag & Drop Dropzone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? 'border-indigo-500 bg-indigo-500/10'
            : selectedFile
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])}
          className="hidden"
        />

        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
          <FileText className="h-6 w-6" />
        </div>

        {selectedFile ? (
          <div>
            <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to embed
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-200">
              <span className="font-semibold text-indigo-400">Click to browse</span> or drag & drop files here
            </p>
            <p className="text-xs text-slate-500 mt-1">Supports PDF, PNG, JPG, or TXT documents up to 50MB</p>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Trigger Button */}
      {selectedFile && !isProcessing && jobStatus?.status !== 'completed' && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleUpload}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
          >
            <Sparkles className="h-4 w-4" />
            <span>Process & Ingest Document</span>
          </button>
        </div>
      )}

      {/* Real-time Ingestion Progress Stages */}
      {isProcessing && jobStatus && (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              Pipeline Execution: {jobStatus.filename}
            </span>
            <span className="font-mono text-indigo-400 font-bold">{jobStatus.progress}%</span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(jobStatus.progress, uploadProgress)}%` }}
            />
          </div>

          {/* Multi-stage indicators */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className={`rounded-lg p-2 border ${jobStatus.progress >= 20 ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 text-slate-500'}`}>
              <FileText className="h-3.5 w-3.5 mx-auto mb-1" />
              <span>1. PDF & VLM Extraction</span>
            </div>
            <div className={`rounded-lg p-2 border ${jobStatus.progress >= 60 ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 text-slate-500'}`}>
              <Layers className="h-3.5 w-3.5 mx-auto mb-1" />
              <span>2. Semantic Chunking</span>
            </div>
            <div className={`rounded-lg p-2 border ${jobStatus.progress >= 90 ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 text-slate-500'}`}>
              <Database className="h-3.5 w-3.5 mx-auto mb-1" />
              <span>3. Qdrant Embeddings</span>
            </div>
          </div>
        </div>
      )}

      {/* Completion Success Banner */}
      {jobStatus?.status === 'completed' && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Document successfully parsed, chunked, and embedded into Qdrant!</span>
          </div>
          <button
            onClick={() => {
              setSelectedFile(null);
              setJobStatus(null);
            }}
            className="rounded border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold hover:bg-emerald-500/30"
          >
            Upload Another
          </button>
        </div>
      )}
    </div>
  );
}
