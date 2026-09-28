import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { authApi, chatApi, documentsApi } from '../api/client';

const STORE_KEY = 'omnibrain-chat-store-v1';
const THEME_KEY = 'omnibrain-theme';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function createSession() {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    docId: null,
    attachment: null,
    suggestions: [],
    historyLoaded: false,
    createdAt: Date.now(),
  };
}

function readStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (stored?.sessions?.length) {
      const sessions = stored.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
        suggestions: Array.isArray(session.suggestions) ? session.suggestions : [],
      }));
      return {
        sessions,
        activeId: sessions.some((session) => session.id === stored.activeId)
          ? stored.activeId
          : sessions[0].id,
      };
    }
  } catch {
    localStorage.removeItem(STORE_KEY);
  }
  const session = createSession();
  return { sessions: [session], activeId: session.id };
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAgentLabel(agent) {
  return ({
    search_agent: 'Search Agent',
    vision_agent: 'Vision Agent',
    sql_agent: 'SQL Agent',
    supervisor: 'OmniBrain',
  })[agent] || 'OmniBrain';
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function ChatWorkspace({ onOpenAuth }) {
  const [store, setStore] = useState(readStore);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [userLabel, setUserLabel] = useState('Sign in');
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const activeSession = store.sessions.find((session) => session.id === store.activeId) || store.sessions[0];

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeSession?.messages, sending, activeSession?.suggestions]);

  useEffect(() => {
    authApi.getMe().then((user) => {
      setUserLabel(user.username || user.full_name || 'Account');
    }).catch(() => setUserLabel('Sign in'));
  }, []);

  function updateSession(sessionId, update) {
    setStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) => (
        session.id === sessionId
          ? { ...session, ...(typeof update === 'function' ? update(session) : update) }
          : session
      )),
    }));
  }

  function startNewChat() {
    const session = createSession();
    setStore((current) => ({ sessions: [session, ...current.sessions], activeId: session.id }));
    setDraft('');
  }

  async function selectSession(session) {
    setStore((current) => ({ ...current, activeId: session.id }));
    setDraft('');
    if (session.historyLoaded || session.messages.length) return;
    try {
      const history = await chatApi.getHistory(session.id);
      const messages = (history.messages || []).map((message, index) => ({
        id: `${session.id}-${index}`,
        role: message.role,
        content: message.content,
        citations: message.citations || [],
        agent: 'supervisor',
        timestamp: message.timestamp,
      }));
      updateSession(session.id, { messages, historyLoaded: true });
    } catch {
      updateSession(session.id, { historyLoaded: true });
    }
  }

  async function sendQuestion(rawQuestion) {
    const query = rawQuestion.trim();
    const session = store.sessions.find((item) => item.id === store.activeId);
    if (!query || sending || uploading || !session) return;
    if (session.attachment && session.attachment.status !== 'ready') return;

    setDraft('');
    updateSession(session.id, (current) => ({
      title: current.messages.length ? current.title : query.slice(0, 42),
      messages: [...current.messages, {
        id: crypto.randomUUID(), role: 'user', content: query, timestamp: new Date().toISOString(),
      }],
    }));
    setSending(true);
    try {
      const response = await chatApi.sendMessage({
        session_id: session.id,
        query,
        doc_id: session.docId || undefined,
      });
      updateSession(session.id, (current) => ({
        messages: [...current.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.response || response.memo || 'No response was returned.',
          agent: response.agent || 'supervisor',
          citations: response.citations || [],
          timestamp: response.generated_at || new Date().toISOString(),
        }],
      }));
    } catch (error) {
      const detail = error.response?.data?.detail || error.response?.data?.message || error.message;
      updateSession(session.id, (current) => ({
        messages: [...current.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I couldn't complete that request: ${detail}`,
          agent: 'supervisor',
          citations: [],
          timestamp: new Date().toISOString(),
        }],
      }));
    } finally {
      setSending(false);
    }
  }

  async function attachFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      updateSession(store.activeId, { attachment: { name: file.name, size: file.size, status: 'error', error: 'Choose a PDF file.' } });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      updateSession(store.activeId, { attachment: { name: file.name, size: file.size, status: 'error', error: 'PDFs must be 50 MB or smaller.' } });
      return;
    }

    const sessionId = store.activeId;
    setUploading(true);
    updateSession(sessionId, {
      docId: null,
      suggestions: [],
      attachment: { name: file.name, size: file.size, status: 'extracting', progress: 0 },
    });
    try {
      const uploaded = await documentsApi.uploadFile(file, (event) => {
        const progress = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
        updateSession(sessionId, (current) => ({
          attachment: { ...current.attachment, status: 'extracting', progress },
        }));
      });
      const docId = uploaded.doc_id || uploaded.job_id;
      const jobId = uploaded.job_id || docId;
      if (!docId || !jobId) throw new Error('Upload did not return a document ID.');
      updateSession(sessionId, {
        docId,
        attachment: { name: file.name, size: file.size, status: 'indexing', progress: 0 },
      });

      let completed = false;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const status = await documentsApi.getStatus(jobId);
        updateSession(sessionId, (current) => ({
          attachment: { ...current.attachment, status: 'indexing', progress: status.progress || 0 },
        }));
        if (status.status === 'completed') {
          completed = true;
          break;
        }
        if (status.status === 'failed') throw new Error(status.error || 'Document indexing failed.');
        await wait(1000);
      }
      if (!completed) throw new Error('Indexing is taking longer than expected. Try again shortly.');

      updateSession(sessionId, (current) => ({
        attachment: { ...current.attachment, status: 'ready', progress: 100 },
        messages: [...current.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**${file.name}** is ready. Ask a question or choose a suggested question below.`,
          agent: 'supervisor',
          citations: [],
          timestamp: new Date().toISOString(),
        }],
      }));
      try {
        const generated = await documentsApi.getSuggestions(docId);
        updateSession(sessionId, { suggestions: generated.questions || [] });
      } catch {
        updateSession(sessionId, {
          suggestions: [
            "Summarize the document's main conclusions.",
            'What key figures or metrics does it report?',
            'What risks or uncertainties are discussed?',
            'Which tables contain the most important evidence?',
            'What changed over time in this document?',
          ],
        });
      }
    } catch (error) {
      updateSession(sessionId, (current) => ({
        docId: null,
        attachment: { ...current.attachment, status: 'error', error: error.response?.data?.detail || error.message },
      }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    attachFile(event.dataTransfer.files?.[0]);
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(draft);
    }
  }

  const hasConversation = activeSession.messages.length > 0;
  const attachment = activeSession.attachment;

  return (
    <div className={`chat-app theme-${theme}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false);
    }} onDrop={handleDrop}>
      <aside className={`chat-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`} aria-label="Chat history">
        <div className="sidebar-brand">
          <div className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></div>
          <span>OmniBrain</span>
          <button className="icon-button sidebar-collapse" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose size={18} />
          </button>
        </div>
        <button className="new-chat-button" onClick={startNewChat}>
          <Plus size={17} /> <span>New chat</span>
        </button>
        <div className="history-label">RECENT</div>
        <nav className="session-list">
          {store.sessions.map((session) => (
            <button
              className={`session-item ${session.id === activeSession.id ? 'selected' : ''}`}
              key={session.id}
              onClick={() => selectSession(session)}
              title={session.title}
            >
              <MessageSquareText size={16} />
              <span>{session.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="account-button" onClick={onOpenAuth} title="Account and sign in">
            <span className="account-avatar"><UserRound size={16} /></span>
            <span className="account-label">{userLabel}</span>
          </button>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-topbar">
          <div className="topbar-leading">
            {!sidebarOpen && (
              <button className="icon-button" title="Open sidebar" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}>
                <PanelLeftOpen size={19} />
              </button>
            )}
            <span className="topbar-title">{activeSession.title}</span>
          </div>
          <div className="topbar-actions">
            {attachment?.status === 'ready' && <span className="attached-document"><FileText size={14} /> {attachment.name}</span>}
            <button className="icon-button theme-toggle" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} aria-label="Toggle color theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        <section className={`conversation ${hasConversation ? 'has-messages' : 'is-empty'}`} aria-label="Conversation">
          {!hasConversation && (
            <div className="welcome-panel">
              <div className="welcome-icon"><Sparkles size={20} /></div>
              <h1>What would you like to understand?</h1>
              <p>Ask a question, or attach a PDF to explore its contents.</p>
              <div className="starter-prompts">
                {[
                  'Summarize a document',
                  'Find key figures and risks',
                  'Compare important details',
                ].map((prompt) => (
                  <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>
                ))}
              </div>
            </div>
          )}

          {activeSession.messages.map((message) => (
            <article className={`message-row ${message.role}`} key={message.id}>
              <div className={`message-avatar ${message.role}`}>
                {message.role === 'user' ? <UserRound size={17} /> : <Bot size={18} />}
              </div>
              <div className="message-content">
                {message.role === 'assistant' && (
                  <div className={`agent-pill agent-${message.agent || 'supervisor'}`}>
                    <Bot size={13} /><span>{getAgentLabel(message.agent)}</span>
                  </div>
                )}
                <div className={`markdown-body ${message.role}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.role === 'assistant' && message.citations?.length > 0 && (
                  <details className="sources-drawer">
                    <summary><ShieldCheck size={15} /> Citations &amp; Sources <span>{message.citations.length}</span></summary>
                    <div className="source-list">
                      {message.citations.map((citation, index) => (
                        <details className="source-item" key={`${citation.document_id || citation.source}-${citation.chunk_index || index}`}>
                          <summary>
                            <span className="source-title"><FileText size={14} /> {citation.document_title || citation.source || 'Document'}</span>
                            <span className="source-meta">
                              {citation.page ? `Page ${citation.page}` : 'Source'}
                              {citation.score != null ? ` · ${(citation.score * 100).toFixed(1)}%` : ''}
                            </span>
                          </summary>
                          <blockquote>{citation.snippet}</blockquote>
                          {citation.chunk_index != null && <span className="chunk-label">Chunk {citation.chunk_index}</span>}
                        </details>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </article>
          ))}

          {sending && (
            <div className="message-row assistant pending-message">
              <div className="message-avatar assistant"><Bot size={18} /></div>
              <div className="pending-label"><LoaderCircle size={16} className="spin" /> Searching the document…</div>
            </div>
          )}

          {activeSession.suggestions.length > 0 && attachment?.status === 'ready' && (
            <div className="suggestion-block">
              <div className="suggestion-heading">Explore this document</div>
              <div className="suggestion-grid">
                {activeSession.suggestions.slice(0, 5).map((question) => (
                  <button key={question} onClick={() => sendQuestion(question)} disabled={sending || uploading}>
                    <span>{question}</span><ArrowUp size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </section>

        <div className="composer-wrap">
          {attachment && (
            <div className={`file-chip ${attachment.status}`}>
              <div className="file-chip-icon">
                {attachment.status === 'ready' ? <Check size={16} /> : attachment.status === 'error' ? <AlertCircle size={16} /> : <FileText size={16} />}
              </div>
              <div className="file-chip-info">
                <span className="file-chip-name">{attachment.name}</span>
                <span className="file-chip-status">
                  {attachment.status === 'extracting' && `Extracting… ${attachment.progress || 0}%`}
                  {attachment.status === 'indexing' && `Indexing… ${attachment.progress || 0}%`}
                  {attachment.status === 'ready' && `Ready · ${formatBytes(attachment.size || 0)}`}
                  {attachment.status === 'error' && (attachment.error || 'Upload failed')}
                </span>
              </div>
              {attachment.status === 'indexing' || attachment.status === 'extracting'
                ? <LoaderCircle size={16} className="spin file-chip-progress" />
                : <button className="chip-remove" title="Remove attachment" aria-label="Remove attachment" onClick={() => updateSession(activeSession.id, { docId: null, attachment: null, suggestions: [] })}><X size={15} /></button>}
            </div>
          )}
          <form className="composer" onSubmit={(event) => { event.preventDefault(); sendQuestion(draft); }}>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => attachFile(event.target.files?.[0])}
            />
            <button type="button" className="composer-tool" title="Attach a PDF" aria-label="Attach a PDF" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Paperclip size={19} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={attachment?.status === 'indexing' ? 'Your PDF is being indexed…' : 'Message OmniBrain'}
              rows={1}
              aria-label="Message OmniBrain"
              disabled={sending}
            />
            <button type="submit" className="send-button" title="Send message" aria-label="Send message" disabled={!draft.trim() || sending || uploading || (attachment && attachment.status !== 'ready')}>
              {sending ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={19} />}
            </button>
          </form>
          <p className="composer-note">OmniBrain can make mistakes. Check important information against its cited source.</p>
        </div>

        {dragActive && (
          <div className="drop-overlay" aria-live="polite">
            <div><Paperclip size={25} /><strong>Drop a PDF to add it to this chat</strong></div>
          </div>
        )}
      </main>
    </div>
  );
}