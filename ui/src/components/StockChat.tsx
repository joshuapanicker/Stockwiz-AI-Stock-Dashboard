import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import clsx from "clsx";
import PredictionChart from "./PredictionChart";
import TypewriterMessage from "./TypewriterMessage";
import { apiFetch, API_BASE, getAuthHeaders } from "../hooks/useApi";

interface Message {
  role: "user" | "assistant";
  content: string;
  prediction?: any;
}

const SUGGESTIONS = [
  "Why is this stock worth watching?",
  "What are the biggest risks right now?",
  "Is this a good entry point?",
  "Show me a price prediction chart",
];

interface Props {
  symbol: string;
  currentPrice?: number;
}

async function streamChat(symbol: string, messages: Message[], onToken: (t: string) => void, signal: AbortSignal) {
  const res = await fetch(`${API_BASE}/chat/${symbol}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

export default function StockChat({ symbol, currentPrice = 0 }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setMessages([]); setInput(""); }, [symbol]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const isPrediction = text.toLowerCase().includes("predict") || text.toLowerCase().includes("prediction chart");

    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setInput("");

    if (isPrediction) {
      setMessages([...next, { role: "assistant", content: "" }]);
      setStreaming(true);
      try {
        const pred = await apiFetch<any>(`/predict/${symbol}`);
        setMessages([...next, {
          role: "assistant",
          content: `Here is the 90-day price projection for ${symbol}. The base case reflects current momentum, bull case assumes improving conditions, and bear case accounts for downside risk.`,
          prediction: pred,
        }]);
      } catch (e: any) {
        setMessages([...next, { role: "assistant", content: `Error: ${e.message}` }]);
      } finally {
        setStreaming(false);
      }
      return;
    }

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...next, assistantMsg]);
    setStreaming(true);
    abortRef.current = new AbortController();
    let full = "";

    try {
      await streamChat(symbol, next, (token) => {
        full += token;
        setMessages(prev => {
          const u = [...prev];
          u[u.length - 1] = { role: "assistant", content: full };
          return u;
        });
      }, abortRef.current.signal);
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-muted text-xs px-1">Ask anything about {symbol}</p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)}
                className="w-full text-left text-xs px-3 py-2 rounded-lg bg-card2 border border-border/50 text-white/60 hover:text-white hover:border-green/30 transition-colors">
                {s}
              </button>
            ))}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              const isStreamingThis = streaming && isLast && msg.role === "assistant";
              if (msg.role === "assistant" && msg.content === "" && isStreamingThis) {
                return (
                  <div key={i} className="flex gap-2 justify-start">
                    <div className="w-5 h-5 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={11} className="text-green" />
                    </div>
                    <div className="bg-card2 border border-border/50 rounded-xl px-3 py-2">
                      <span className="inline-block w-[2px] h-3 bg-green align-middle animate-pulse opacity-70" />
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className={clsx("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="w-5 h-5 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={11} className="text-green" />
                    </div>
                  )}
                  <div className={clsx(
                    "rounded-xl px-3 py-2 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "max-w-[85%] bg-green/10 border border-green/20 text-white"
                      : msg.prediction ? "w-full bg-card2 border border-border/50" : "max-w-[85%] bg-card2 border border-border/50"
                  )}>
                    {msg.role === "assistant" ? (
                      isStreamingThis
                        ? <TypewriterMessage content={msg.content} isStreaming={true} />
                        : <>{msg.content.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").split("\n").filter(Boolean).map((line, j) => (
                            <p key={j} className={clsx("text-white", line.startsWith("-") || line.match(/^\d+\./) ? "pl-2 mt-1" : "mt-1 first:mt-0")}>{line}</p>
                          ))}</>
                    ) : (
                      msg.content.split("\n").filter(Boolean).map((line, j) => (
                        <p key={j} className={clsx("text-white", line.startsWith("-") || line.match(/^\d+\./) ? "pl-2 mt-1" : "mt-1 first:mt-0")}>{line}</p>
                      ))
                    )}
                    {msg.prediction && (
                      <div className="mt-3">
                        <PredictionChart data={msg.prediction} currentPrice={currentPrice || msg.prediction.current_price} />
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={11} className="text-white/60" />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="px-3 pb-3 pt-2 border-t border-border/50 flex-shrink-0">
        <div className="flex gap-2 items-center bg-card2 border border-border rounded-xl px-3 py-2 focus-within:border-green/40 transition-colors">
          <input ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={`Ask about ${symbol}...`}
            className="flex-1 bg-transparent text-xs text-white placeholder-muted focus:outline-none" />
          <button onClick={() => send(input)} disabled={!input.trim() || streaming}
            className="text-muted hover:text-green disabled:opacity-30 transition-colors flex-shrink-0">
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
