"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  category: string | null;
  content: string;
  chunkIndex: number;
  similarity: number;
}

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setError(null);
    setResults(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), topK: 8 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setResults(data.results);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-6">Search Documents</h1>

      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your documents…"
          className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !query.trim()}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {results !== null && results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-12">
          No matching passages found. Try different keywords, or make sure you have
          confirmed at least one document.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">{results.length} passage{results.length !== 1 ? "s" : ""} found</p>
          {results.map((r) => (
            <div
              key={r.chunkId}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link
                  href={`/documents/${r.documentId}`}
                  className="text-sm font-medium text-blue-600 hover:underline truncate"
                >
                  {r.documentTitle ?? "Untitled Document"}
                </Link>
                <span className="shrink-0 text-xs text-gray-400">
                  {Math.round(r.similarity * 100)}% match
                </span>
              </div>
              {r.category && (
                <span className="inline-block mb-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {r.category}
                </span>
              )}
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-5">
                {r.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
