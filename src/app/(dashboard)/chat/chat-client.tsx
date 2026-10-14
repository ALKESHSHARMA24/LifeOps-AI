"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolCallsMade?: Array<{ name: string; args: Record<string, unknown>; result: string }>;
  createdAt?: string;
}

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: Date | string;
}

interface Props {
  initialConversations: Conversation[];
}

export default function ChatClient({ initialConversations }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  function loadConversation(convId: string) {
    setActiveConvId(convId);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/chat/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(
          data.messages
            .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
            .map((m: { id: string; role: string; content: string; toolResults?: unknown; createdAt: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              toolCallsMade: m.toolResults ? (m.toolResults as Message["toolCallsMade"]) : undefined,
              createdAt: m.createdAt,
            }))
        );
      }
    });
  }

  function startNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setError(null);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isPending) return;

    setInput("");
    setError(null);

    // Optimistically add user message
    const optimisticMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, optimisticMsg]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationId: activeConvId ?? undefined }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Chat failed");

        // Set the conversation ID (new conversations get one now)
        if (!activeConvId) {
          setActiveConvId(data.conversationId);
          // Refresh conversation list to include new one
          const listRes = await fetch("/api/chat");
          if (listRes.ok) {
            const listData = await listRes.json();
            setConversations(listData.conversations);
          }
        } else {
          // Update title in sidebar if it changed
          setConversations((prev) =>
            prev.map((c) =>
              c.id === data.conversationId ? { ...c, updatedAt: new Date() } : c
            )
          );
        }

        setMessages((prev) => [...prev, data.message as Message]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        // Remove the optimistic user message on failure
        setMessages((prev) => prev.slice(0, -1));
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-8">
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col shrink-0 bg-gray-50/50">
        <div className="p-4 border-b">
          <button
            onClick={startNewChat}
            className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 px-4 hover:bg-blue-700 transition-colors"
          >
            + New Chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-400 px-2 py-4 text-center">No conversations yet</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors truncate ${
                activeConvId === c.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {c.title ?? "New conversation"}
            </button>
          ))}
        </nav>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !isPending && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="text-4xl mb-4">💬</div>
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Ask LifeOps anything</h2>
                <p className="text-sm text-gray-500">
                  Try: "When does my car insurance expire?" or "What are my upcoming payments?"
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id ?? i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {/* Show tool calls made (Phase 4) */}
                {msg.toolCallsMade && msg.toolCallsMade.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                    {msg.toolCallsMade.map((tc, j) => (
                      <div key={j} className="text-xs text-gray-400">
                        🔧 Used tool: <span className="font-mono">{tc.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-gray-400 mr-2">LifeOps is thinking</span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center">
              <span className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                {error}
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 bg-white">
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents, deadlines, or anything else…"
              className="flex-1 rounded-full border border-gray-300 px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-2">
            LifeOps can search your documents, list commitments, and set reminders
          </p>
        </div>
      </div>
    </div>
  );
}
