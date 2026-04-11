import { useState, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  prediction?: any;
}

export function useStreamingChat(endpoint: (messages: Message[]) => string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string, extraData?: any) {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setStreaming(true);

    // Add empty assistant message that we'll fill in
    const assistantMsg: Message = { role: "assistant", content: "", ...extraData };
    setMessages([...next, assistantMsg]);

    abortRef.current = new AbortController();

    try {
      const url = endpoint(next);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages([...next, { role: "assistant", content: `Error: ${err}` }]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) {
              accumulated += parsed.token;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: accumulated,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: `Error: ${e.message}` };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  }

  return { messages, setMessages, streaming, send, reset };
}
