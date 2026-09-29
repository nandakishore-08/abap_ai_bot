"use client";

import {
  ArrowUp,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import AOS from "aos";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  startTransition,
  useState,
} from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

type GroqChunk = {
  choices?: Array<{
    delta?: { content?: string };
  }>;
};

const HISTORY_KEY = "cove-chat-history-v1";
const EMPTY_MESSAGES: Message[] = [];
const SUGGESTIONS = [
  "Explain a tricky idea simply",
  "Help me plan a weekend trip",
  "Draft a thoughtful project update",
  "Compare two ways to solve a problem",
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    AOS.init({
      duration: 650,
      easing: "ease-out-cubic",
      once: true,
      offset: 28,
      disable: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, []);

  useEffect(() => {
    startTransition(() => {
      try {
        const saved = localStorage.getItem(HISTORY_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Conversation[];
          if (Array.isArray(parsed)) {
            setConversations(parsed);
            const mostRecent = [...parsed].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (mostRecent) setActiveId(mostRecent.id);
          }
        }
      } catch {
        localStorage.removeItem(HISTORY_KEY);
      } finally {
        setIsHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
    }
  }, [conversations, isHydrated]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveId(null);
        setDraft("");
        setError("");
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const activeConversation = conversations.find((item) => item.id === activeId);
  const messages = activeConversation?.messages ?? EMPTY_MESSAGES;
  const filteredConversations = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((conversation) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return (
        conversation.title.toLowerCase().includes(query) ||
        conversation.messages.some((message) => message.content.toLowerCase().includes(query))
      );
    });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    AOS.refreshHard();
  }, [activeId, isHydrated, messages.length]);

  function startNewChat() {
    setActiveId(null);
    setDraft("");
    setError("");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  function removeConversation(id: string) {
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    setConversations(remaining);
    if (activeId === id) {
      setActiveId([...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null);
    }
  }

  function selectConversation(id: string) {
    setActiveId(id);
    setError("");
    setSidebarOpen(false);
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || isStreaming) return;

    setDraft("");
    setError("");
    setIsStreaming(true);

    const conversationId = activeId ?? crypto.randomUUID();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const previous = conversations.find((conversation) => conversation.id === conversationId);
    const nextMessages = [...(previous?.messages ?? []), userMessage, assistantMessage];
    const now = Date.now();
    const nextConversation: Conversation = {
      id: conversationId,
      title: previous?.title ?? content.slice(0, 48),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      messages: nextMessages,
    };

    setActiveId(conversationId);
    setConversations((current) => {
      const exists = current.some((conversation) => conversation.id === conversationId);
      return exists
        ? current.map((conversation) =>
            conversation.id === conversationId ? nextConversation : conversation,
          )
        : [nextConversation, ...current];
    });

    const updateAssistant = (answer: string) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: Date.now(),
                messages: conversation.messages.map((message) =>
                  message.id === assistantMessage.id ? { ...message, content: answer } : message,
                ),
              }
            : conversation,
        ),
      );
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...(previous?.messages ?? []), userMessage].map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "The assistant could not respond. Please try again.");
      }
      if (!response.body) throw new Error("This response could not be streamed. Please try again.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      const consumeLine = (line: string) => {
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return;
        const chunk = JSON.parse(data) as GroqChunk;
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          answer += text;
          updateAssistant(answer);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        lines.forEach(consumeLine);
        if (done) break;
      }
      if (buffer) consumeLine(buffer);
      if (!answer) throw new Error("The assistant returned an empty response. Please try again.");
    } catch (sendError) {
      setError(getErrorMessage(sendError));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: conversation.messages.filter(
                  (message) => message.id !== assistantMessage.id,
                ),
              }
            : conversation,
        ),
      );
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="app-shell">
      <button
        aria-label="Close navigation"
        className={`sidebar-scrim ${sidebarOpen ? "is-visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
      />

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-topline">
          <a
            aria-label="NANDA KISHORE BOT"
            className="brand-lockup"
            data-aos="fade-down"
            href="#"
            onClick={(event) => event.preventDefault()}
          >
            <span className="brand-mark"><Sparkles size={18} strokeWidth={2.1} /></span>
            <span className="brand-copy">
              <span className="brand-name"><span>NANDA</span> <span className="brand-kishore">KISHORE</span></span>
              <span className="brand-version"><span className="brand-bot-tag">BOT</span> PERSONAL AI</span>
            </span>
          </a>
          <button
            className="icon-button sidebar-collapse"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button className="new-chat-button" onClick={startNewChat}>
          <MessageSquarePlus size={17} />
          <span>New conversation</span>
          <span className="new-chat-shortcut">⌘ K</span>
        </button>

        <label className="history-search">
          <Search size={16} />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch("")} type="button">
              <X size={14} />
            </button>
          )}
        </label>

        <div className="history-heading">
          <span>YOUR LIBRARY</span>
        </div>
        <div className="conversation-list">
          {!filteredConversations.length ? (
            <p className="empty-history">
              {search ? "No matching conversations" : "Your conversations will appear here"}
            </p>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                className={`conversation-row ${activeId === conversation.id ? "conversation-active" : ""}`}
                key={conversation.id}
              >
                <button
                  className="conversation-select"
                  onClick={() => selectConversation(conversation.id)}
                  title={conversation.title}
                >
                  <span className="conversation-title">{conversation.title}</span>
                  <span className="conversation-date">{formatDate(conversation.updatedAt)}</span>
                </button>
                <button
                  aria-label={`Delete ${conversation.title}`}
                  className="icon-button conversation-delete"
                  onClick={() => removeConversation(conversation.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="profile-avatar">Y</div>
          <div className="profile-copy">
            <span className="profile-name">Your workspace</span>
            <span className="profile-plan">Personal space</span>
          </div>
        </div>
      </aside>

      <section className="chat-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <div className="model-selector">
              <span className="model-spark"><Sparkles size={14} /></span>
              <span>GPT-OSS 120B</span>
              <span className="model-divider" />
              <span className="model-label">Groq</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="status-dot" />
            <span className="status-label">Ready to think</span>
            <button className="icon-button mobile-new-chat" aria-label="New conversation" onClick={startNewChat}>
              <SquarePen size={18} />
            </button>
          </div>
        </header>

        <div className={`conversation-view ${messages.length ? "has-messages" : ""}`}>
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-kicker" data-aos="fade-down"><span /> A quick conversation starts here</div>
              <h1 data-aos="fade-up" data-aos-delay="80">
                Let&apos;s have a quick<br /><em>conversation</em> with
              </h1>
              <div className="welcome-brand" data-aos="zoom-in" data-aos-delay="180">
                <span className="welcome-brand-mark"><Sparkles size={15} /></span>
                <span>NANDA <strong>KISHORE BOT</strong></span>
              </div>
              <p className="welcome-description" data-aos="fade-up" data-aos-delay="220">
                Bring a question, a half-formed idea, or a task you&apos;ve been putting off.
              </p>
              <div className="suggestion-grid">
                {SUGGESTIONS.map((suggestion, index) => (
                  <button
                    className="suggestion-card"
                    data-aos="fade-up"
                    data-aos-delay={280 + index * 80}
                    key={suggestion}
                    onClick={() => setDraft(suggestion)}
                  >
                    <span className={`suggestion-glyph glyph-${index + 1}`}>
                      {index === 0 ? "Aa" : index === 1 ? "↗" : index === 2 ? "✳" : "⇄"}
                    </span>
                    <span>{suggestion}</span>
                    <ArrowUp className="suggestion-arrow" size={15} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              <div className="thread-heading" data-aos="fade-down">
                <span className="thread-overline">CONVERSATION</span>
                <h1>{activeConversation?.title}</h1>
              </div>
              {messages.map((message) => (
                <article
                  className={`message message-${message.role}`}
                  data-aos="fade-up"
                  key={message.id}
                >
                  <div className={`message-avatar ${message.role === "assistant" ? "assistant-avatar" : "user-avatar"}`}>
                    {message.role === "assistant" ? <Sparkles size={15} /> : "Y"}
                  </div>
                  <div className="message-body">
                    <div className="message-author">
                      {message.role === "assistant" ? "NANDA KISHORE BOT" : "You"}
                    </div>
                    {message.content ? (
                      <div className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="thinking-indicator" aria-label="NANDA KISHORE BOT is thinking">
                        <span /><span /><span />
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="composer-dock">
          <form className="composer" onSubmit={handleSubmit}>
            {error && <div className="composer-error" role="alert">{error}</div>}
            <textarea
              ref={textareaRef}
              aria-label="Message NANDA KISHORE BOT"
              placeholder="Ask anything, or start with an idea..."
              rows={1}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
              }}
              onKeyDown={handleComposerKeyDown}
            />
            <div className="composer-toolbar">
              <span className="composer-hint">Thoughtful answers, one message at a time</span>
              <button
                className={`send-button ${draft.trim() && !isStreaming ? "send-ready" : ""}`}
                aria-label="Send message"
                disabled={!draft.trim() || isStreaming}
                type="submit"
              >
                {isStreaming ? <span className="send-spinner" /> : <ArrowUp size={18} strokeWidth={2.3} />}
              </button>
            </div>
          </form>
          <p className="composer-footnote">
            NANDA KISHORE BOT can make mistakes. Check important information.
            <span className="footnote-separator">·</span> Your chats stay in this browser.
          </p>
        </div>
      </section>
    </main>
  );
}