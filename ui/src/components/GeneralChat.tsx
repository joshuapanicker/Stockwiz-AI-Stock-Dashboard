import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Plus, MessageSquare, Trash2, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { apiFetch, API_BASE } from "../hooks/useApi";
import TypewriterMessage from "./TypewriterMessage";

interface Message { role: "user" | "assistant"; content: string; }
interface ChatSession { id: string; title: string; messages: Message[]; createdAt: number; }

const SUGGESTIONS = [
  { label: "Sector strength", prompt: "What sectors look strong right now given current market conditions?" },
  { label: "Bear market strategy", prompt: "What are the best strategies to protect a portfolio in a bear market?" },
  { label: "VIX explained", prompt: "What does a high VIX signal and how should I react to it?" },
  { label: "Growth vs Value", prompt: "What is the difference between growth and value investing?" },
  { label: "Dollar cost averaging", prompt: "Explain dollar cost averaging and when it makes sense to use it." },
  { label: "Evaluating valuation", prompt: "How do I evaluate whether a stock is overvalued or undervalued?" },
];

function genId() { return Math.random().toString(36).slice(2, 10); }

function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try { return JSON.parse(localStorage.getItem("mkt_chat_sessions") || "[]"); }
    catch { return []; }
  });
  const save = useCallback((u: ChatSession[]) => {
    setSessions(u);
    localStorage.setItem("mkt_chat_sessions", JSON.stringify(u));
  }, []);
  const createSession = useCallback((cur: ChatSession[]) => {
    const s: ChatSession = { id: genId(), title: "New chat", messages: [], createdAt: Date.now() };
    save([s, ...cur]); return s;
  }, [save]);
  const updateSession = useCallback((cur: ChatSession[], id: string, patch: Partial<ChatSession>) => {
    save(cur.map(s => s.id === id ? { ...s, ...patch } : s));
  }, [save]);
  const deleteSession = useCallback((cur: ChatSession[], id: string) => {
    save(cur.filter(s => s.id !== id));
  }, [save]);
  return { sessions, createSession, updateSession, deleteSession };
}

async function streamChat(url: string, messages: Message[], onToken: (t: string) => void, signal: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) }),
    signal,
  });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (d === "[DONE]") return;
      try { const p = JSON.parse(d); if (p.token) onToken(p.token); } catch {}
    }
  }
}

export default function GeneralChat() {
  const { sessions, createSession, updateSession, deleteSession } = useChatHistory();
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cur = sessionsRef.current;
    if (cur.length > 0) { setActiveId(cur[0].id); setMessages(cur[0].messages); }
    else { const s = createSession(cur); setActiveId(s.id); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    let sid = activeId;
    if (!sid) { const s = createSession(sessionsRef.current); sid = s.id; setActiveId(s.id); }

    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...next, assistantMsg]);
    setInput("");
    setStreaming(true);

    abortRef.current = new AbortController();
    let full = "";
    try {
      await streamChat(`${API_BASE}/chat/general`, next, (token) => {
        full += token;
        setMessages(prev => {
          const u = [...prev];
          u[u.length - 1] = { role: "assistant", content: full };
          return u;
        });
      }, abortRef.current.signal);

      const finalMsgs = [...next, { role: "assistant" as const, content: full }];
      updateSession(sessionsRef.current, sid, { messages: finalMsgs });

      if (next.length === 1) {
        apiFetch<{ title: string }>("/chat/title", {
          method: "POST",
          body: JSON.stringify({ messages: finalMsgs.slice(0, 4) }),
        }).then(r => updateSession(sessionsRef.current, sid!, { title: r.title })).catch(() => {});
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: `Error: ${e.message}` }; return u; });
      }
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function newChat() {
    abortRef.current?.abort();
    const s = createSession(sessionsRef.current);
    setActiveId(s.id); setMessages([]); setInput("");
  }

  function selectSession(id: string) {
    abortRef.current?.abort();
    const s = sessionsRef.current.find(x => x.id === id);
    setActiveId(id); setMessages(s?.messages ?? []); setInput("");
  }

  function formatDate(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden relative">
      {/* Market Chat gradient */}
      <div className="fixed inset-0 pointer-events-none z-0 gradient-reveal"
        style={{ background: "radial-gradient(ellipse 120% 80% at 100% 0%, rgba(46,230,168,0.09) 0%, transparent 60%), radial-gradient(ellipse 120% 80% at 0% 100%, rgba(16,185,129,0.08) 0%, transparent 60%)" }}
      />

      {/* Sidebar */}
      <div className={clsx("relative z-10 flex flex-col border-r border-border/50 transition-all duration-200 flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0 overflow-hidden")}>
        <div className="flex items-center justify-between px-3 pt-4 pb-3 flex-shrink-0">
          <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Chats</span>
          <button onClick={newChat} className="w-6 h-6 rounded-lg bg-green/10 hover:bg-green/20 text-green flex items-center justify-center transition-colors">
            <Plus size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {sessions.length === 0 ? (
            <p className="text-muted text-xs px-2 py-4 text-center">No chats yet</p>
          ) : sessions.map(s => (
            <div key={s.id} onClick={() => selectSession(s.id)}
              className={clsx("group flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer transition-colors",
                activeId === s.id ? "bg-white/8 text-white" : "text-muted hover:bg-white/5 hover:text-white")}>
              <MessageSquare size={12} className="flex-shrink-0 opacity-60" />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{s.title}</p>
                <p className="text-[10px] text-muted/60">{formatDate(s.createdAt)}</p>
              </div>
              <button onClick={e => {
                e.stopPropagation();
                const left = sessionsRef.current.filter(x => x.id !== s.id);
                deleteSession(sessionsRef.current, s.id);
                if (activeId === s.id) {
                  if (left.length > 0) { setActiveId(left[0].id); setMessages(left[0].messages); }
                  else { const fresh = createSession([]); setActiveId(fresh.id); setMessages([]); }
                }
              }} className="opacity-0 group-hover:opacity-100 text-muted hover:text-red transition-all flex-shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="relative z-10 flex flex-1 min-w-0 min-h-0">

        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-border/40 flex-shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)}
            className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
            <ChevronRight size={14} className={clsx("transition-transform", sidebarOpen && "rotate-180")} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Bot size={12} className="text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                {sessions.find(s => s.id === activeId)?.title ?? "Market Assistant"}
              </p>
              <p className="text-[10px] text-muted">Powered by Claude</p>
            </div>
          </div>
          <button onClick={newChat}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl transition-colors mr-10">
            <Plus size={11} />New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-8 gap-8">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <Bot size={24} className="text-purple-400" />
                </div>
                <p className="text-white font-semibold text-lg">Market Assistant</p>
                <p className="text-muted text-sm max-w-xs">Ask about stocks, strategies, market conditions, or economics.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg stagger anim-fade-up" style={{ animationDelay: "100ms" }}>
                {SUGGESTIONS.map(s => (
                  <button key={s.label} onClick={() => send(s.prompt)}
                    className="text-left px-4 py-3 rounded-2xl bg-card2 border border-border/50 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group">
                    <p className="text-xs font-medium text-white group-hover:text-purple-300 transition-colors">{s.label}</p>
                    <p className="text-[10px] text-muted mt-0.5 line-clamp-2">{s.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const isStreamingThis = streaming && isLast && msg.role === "assistant";
                if (msg.role === "assistant" && msg.content === "" && isStreamingThis) {
                  return (
                    <div key={i} className="flex gap-3 justify-start">
                      <div className="w-7 h-7 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={13} className="text-purple-400" />
                      </div>
                      <div className="bg-card2 border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3">
                        <span className="inline-block w-[2px] h-[1em] bg-purple-400 align-middle animate-pulse opacity-70" />
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className={clsx("flex gap-3 anim-fade-up", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={13} className="text-purple-400" />
                      </div>
                    )}
                    <div className={clsx("max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-purple-500/15 border border-purple-500/25 text-white rounded-tr-sm"
                        : "bg-card2 border border-border/60 text-white rounded-tl-sm")}>
                      {msg.role === "assistant" ? (
                        isStreamingThis
                          ? <TypewriterMessage content={msg.content} isStreaming={true} />
                          : <>{msg.content.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").split("\n").filter(Boolean).map((line, j) => (
                              <p key={j} className={line.startsWith("-") || line.match(/^\d+\./) ? "pl-3 mt-1.5" : "mt-1.5 first:mt-0"}>{line}</p>
                            ))}</>
                      ) : (
                        msg.content.split("\n").filter(Boolean).map((line, j) => (
                          <p key={j} className={line.startsWith("-") || line.match(/^\d+\./) ? "pl-3 mt-1.5" : "mt-1.5 first:mt-0"}>{line}</p>
                        ))
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-xl bg-white/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={13} className="text-white/50" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end bg-card2 border border-border/60 rounded-2xl px-4 py-3 focus-within:border-purple-500/40 transition-colors shadow-lg">
              <textarea ref={inputRef} value={input}
                onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                placeholder="Ask about markets, strategies, economics..."
                rows={1} className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none resize-none leading-relaxed"
                style={{ maxHeight: 120, overflowY: "auto" }} />
              <button onClick={() => send(input)} disabled={!input.trim() || streaming}
                className={clsx("w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0",
                  input.trim() && !streaming ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30" : "bg-white/5 text-muted opacity-40")}>
                <Send size={14} />
              </button>
            </div>
            <p className="text-[10px] text-muted text-center mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
        </div>{/* end chat column */}

        {/* Suggestions sidebar — only in chat state */}
        {messages.length > 0 && (
          <div className="w-44 flex-shrink-0 border-l border-border/40 flex flex-col px-3 py-4 gap-2 overflow-y-auto">
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold px-1 mb-1">Suggestions</p>
            {SUGGESTIONS.map(s => (
              <button key={s.label} onClick={() => send(s.prompt)} disabled={streaming}
                className="text-left px-3 py-2.5 rounded-xl bg-card2 border border-border/50 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group disabled:opacity-40">
                <p className="text-xs font-medium text-white/80 group-hover:text-purple-300 transition-colors leading-snug">{s.label}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
