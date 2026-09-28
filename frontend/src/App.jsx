import React, { useState } from 'react';
import './App.css';
import Navbar from './components/Navbar';

import ChatWorkspace from './components/ChatWorkspace';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';
import SystemHealth from './components/SystemHealth';
import AuthModal from './components/AuthModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'documents' | 'system'
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [docRefreshTrigger, setDocRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setDocRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'chat' && (
          <div className="h-[calc(100vh-7.5rem)]">
            <ChatWorkspace />
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="border-b border-slate-800 pb-4">
              <h1 className="text-2xl font-bold tracking-tight text-white">Document Ingestion & Knowledge Base</h1>
              <p className="mt-1 text-sm text-slate-400">
                Upload complex PDF documents (10-K, 10-Q, annual reports) for multi-modal parsing, tabular extraction, and vector index generation.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5">
                <DocumentUpload onUploadSuccess={handleUploadSuccess} />
              </div>
              <div className="lg:col-span-7">
                <DocumentList refreshTrigger={docRefreshTrigger} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="animate-fadeIn">
            <SystemHealth />
          </div>
        )}
      </main>

      {/* Authentication Modal */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
}
