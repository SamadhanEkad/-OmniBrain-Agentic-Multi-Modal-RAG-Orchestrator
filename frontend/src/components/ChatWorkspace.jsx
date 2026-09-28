import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { chatApi } from '../api/client';
import {
  Send,
  Bot,
  User,
  Search,
  Database,
  Eye,
  Sparkles,
  Bookmark,
  ChevronRight,
  PlusCircle,
  FileText,
  ShieldCheck,
  Clock,
  Layers,
} from 'lucide-react';

export default function ChatWorkspace() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I am **OmniBrain**, an Agentic Multi-Modal RAG Orchestrator. Ask me questions about your uploaded financial documents, financial statements, or annual reports, and I will dispatch specialist agents (Search, SQL, or Vision) to deliver a cited, synthesized investment memo.",
      agent: 'supervisor',
      citations: [],
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [sessionId, setSessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(2, 9));
  const [isSending, setIsSending] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputQuery.trim() || isSending) return;

    const query = inputQuery.trim();
    setInputQuery('');

    // Add user message immediately
    const userMessage = {
      id: 'user_' + Date.now(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const response = await chatApi.sendMessage({
        session_id: sessionId,
        query: query,
      });

      const memo = response.response || response.memo || 'No response returned from the supervisor agent.';
      const citations = response.citations || [];

      // Determine the handling specialist agent from citations or content
      let routedAgent = 'supervisor';
      if (citations.some((c) => c.source?.includes('chart') || c.source?.includes('image'))) {
        routedAgent = 'vision_agent';
      } else if (citations.some((c) => c.source?.includes('sql') || c.source?.includes('table'))) {
        routedAgent = 'sql_agent';
      } else if (citations.length > 0) {
        routedAgent = 'search_agent';
      }

      const botMessage = {
        id: 'bot_' + Date.now(),
        role: 'assistant',
        content: memo,
        agent: routedAgent,
        citations: citations,
        timestamp: response.generated_at || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        'Error communicating with the agent orchestrator.';

      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: `⚠️ **Agent Error:** ${errorMsg}`,
          agent: 'system_error',
          citations: [],
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const startNewSession = () => {
    const newId = 'sess_' + Math.random().toString(36).substring(2, 9);
    setSessionId(newId);
    setMessages([
      {
        id: 'welcome_' + Date.now(),
        role: 'assistant',
        content:
          "Started a fresh conversation session. Ask any financial or document query to engage the LangGraph agent graph.",
        agent: 'supervisor',
        citations: [],
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const getAgentBadge = (agent) => {
    switch (agent) {
      case 'search_agent':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
            <Search className="h-2.5 w-2.5" />
            <span>Search Agent (Vector RAG)</span>
          </span>
        );
      case 'sql_agent':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <Database className="h-2.5 w-2.5" />
            <span>SQL Agent (Structured Data)</span>
          </span>
        );
      case 'vision_agent':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            <Eye className="h-2.5 w-2.5" />
            <span>Vision Agent (VLM Parsing)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
            <Sparkles className="h-2.5 w-2.5" />
            <span>LangGraph Supervisor</span>
          </span>
        );
    }
  };

  const samplePrompts = [
    'What were the revenue drivers and YoY growth rates?',
    'Summarize operating margins and free cash flow performance.',
    'Extract key risk factors mentioned in the report.',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-8rem)] min-h-[600px]">
      {/* Sidebar: Conversation Controls & Citations Drawer */}
      <div className="hidden lg:flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Session ID</h4>
            <p className="text-xs font-mono font-semibold text-slate-200">{sessionId}</p>
          </div>
          <button
            onClick={startNewSession}
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title="Start New Conversation"
          >
            <PlusCircle className="h-3.5 w-3.5 text-indigo-400" />
            <span>New</span>
          </button>
        </div>

        {/* Multi-Agent Orchestration Diagram Info */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
          <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            <span>Active Agent Graph</span>
          </h5>
          <div className="space-y-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <span>Supervisor State Router</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              <span>Semantic Search Agent</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Text-to-SQL DB Agent</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>VLM Visual Chart Agent</span>
            </div>
          </div>
        </div>

        {/* Selected Citation Snippet Viewer */}
        <div className="flex-1 overflow-y-auto">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Bookmark className="h-3.5 w-3.5 text-indigo-400" />
            <span>Grounded Citation Detail</span>
          </h5>

          {activeCitation ? (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-slate-200 truncate">{activeCitation.source || 'Document'}</span>
                <span className="text-[10px] rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-indigo-300">
                  Page {activeCitation.page || '1'}
                </span>
              </div>
              <p className="text-slate-300 italic text-[11px] leading-relaxed mb-2 bg-slate-950/40 p-2 rounded border border-slate-800">
                "{activeCitation.snippet}"
              </p>
              {activeCitation.score && (
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Relevance Score:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {(activeCitation.score * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
              Click on any citation pill in the agent memo to inspect the source snippet and confidence score.
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Conversation Container */}
      <div className="lg:col-span-3 flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md overflow-hidden">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role !== 'user' && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
                  <Bot className="h-5 w-5" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'border border-slate-800 bg-slate-950/90 text-slate-100 shadow-sm'
                }`}
              >
                {/* Agent Metadata Header (for Assistant messages) */}
                {msg.role !== 'user' && (
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60">
                    {getAgentBadge(msg.agent)}
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Message Body */}
                <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {/* Citations Footer */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" />
                      Grounded Citations ({msg.citations.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveCitation(c)}
                          className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-indigo-300 hover:border-indigo-500 hover:bg-indigo-500/10 transition"
                        >
                          <FileText className="h-2.5 w-2.5 text-indigo-400" />
                          <span>
                            {c.source || 'Doc'} (p.{c.page || 1})
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}

          {/* Thinking / Ingestion streaming loader */}
          {isSending && (
            <div className="flex gap-3.5 items-start">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
                <Bot className="h-5 w-5 animate-pulse" />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400 flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                </div>
                <span>LangGraph supervisor is delegating query to specialist agents...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Suggestions */}
        {messages.length <= 2 && (
          <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/60 flex flex-wrap gap-2">
            {samplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setInputQuery(prompt)}
                className="text-[11px] rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-slate-400 hover:border-slate-700 hover:text-slate-200 transition"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask OmniBrain about revenues, EBITDA, balance sheets, or document insights..."
              disabled={isSending}
              className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isSending}
              className="flex items-center justify-center rounded-xl bg-indigo-600 px-5 text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
