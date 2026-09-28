import React, { useState } from 'react';
import './App.css';
import ChatWorkspace from './components/ChatWorkspace';
import AuthModal from './components/AuthModal';

export default function App() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <div className="app-root">
      <ChatWorkspace onOpenAuth={() => setIsAuthOpen(true)} />
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
}
