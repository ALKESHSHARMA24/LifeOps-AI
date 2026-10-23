import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, FileText } from "lucide-react";

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  category: string | null;
  content: string;
  similarity: number;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    setSearched(true);
    try {
      const { results } = await api.post<{ results: SearchResult[] }>("/search", { query: query.trim() });
      setResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Semantic Search</h1>
        <p className="text-muted-foreground mt-1">Search across all your documents using natural language</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. when does my health insurance expire?"
          className="flex-1"
        />
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {searched && !searching && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No results found. Try a different query or upload more documents.
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{results.length} result{results.length !== 1 ? "s" : ""} found</p>
          {results.map((r) => (
            <Card key={r.chunkId}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="font-medium truncate">{r.documentTitle ?? "Untitled"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
                    <Badge variant="secondary" className="text-xs">{Math.round(r.similarity * 100)}% match</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{r.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
