"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  Image,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
} from "lucide-react";
import type { DocumentWithExtraction } from "@/modules/documents/document.types";

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "info" | "warning" | "success" | "destructive" | "secondary" }> = {
    uploaded: { label: "Uploaded", variant: "secondary" },
    processing: { label: "Processing…", variant: "info" },
    extracted: { label: "Needs Review", variant: "warning" },
    validated: { label: "Confirmed", variant: "success" },
    indexed: { label: "Indexed", variant: "success" },
    ready: { label: "Ready", variant: "success" },
    error: { label: "Error", variant: "destructive" },
  };
  const { label, variant } = config[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={variant}>{label}</Badge>;
}

function fileIcon(fileType: string) {
  if (fileType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <Image className="h-5 w-5 text-blue-500" />;
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onUploadComplete }: { onUploadComplete: (doc: DocumentWithExtraction) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setIsUploading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      onUploadComplete(data.document);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
        ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}
        ${isUploading ? "pointer-events-none opacity-70" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      <div className="flex flex-col items-center gap-3">
        {isUploading ? (
          <>
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="font-medium text-sm">Uploading and analysing…</p>
            <p className="text-xs text-muted-foreground">AI is reading your document</p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-sm">Drop your document here or click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, WebP — up to 20 MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-destructive text-sm justify-center">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Document Card ────────────────────────────────────────────────────────────

function DocumentCard({ doc, onClick }: { doc: DocumentWithExtraction; onClick: () => void }) {
  const date = new Date(doc.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          {fileIcon(doc.fileType)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {doc.title ?? doc.originalFilename}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {doc.category && (
              <span className="text-xs text-muted-foreground capitalize">{doc.category}</span>
            )}
            {doc.category && <span className="text-muted-foreground">·</span>}
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={doc.status} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
      <p className="font-medium">No documents yet</p>
      <p className="text-sm mt-1">Upload your first document above to get started</p>
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function DocumentsClient({ initialDocuments }: { initialDocuments: DocumentWithExtraction[] }) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);

  function handleUploadComplete(doc: DocumentWithExtraction) {
    // Add the new document to the top of the list and redirect for review
    setDocuments((prev) => [doc, ...prev]);
    router.push(`/documents/${doc.id}`);
  }

  // Status summary counts
  const needsReview = documents.filter((d) => d.status === "extracted").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {documents.length} document{documents.length !== 1 ? "s" : ""}
            {needsReview > 0 && ` · ${needsReview} need${needsReview !== 1 ? "" : "s"} review`}
          </p>
        </div>
      </div>

      {/* Attention banner when docs need review */}
      {needsReview > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm">
            <span className="font-medium">{needsReview} document{needsReview !== 1 ? "s need" : " needs"} your review.</span>{" "}
            Click to confirm the AI-extracted information.
          </p>
        </div>
      )}

      {/* Upload zone */}
      <UploadZone onUploadComplete={handleUploadComplete} />

      {/* Document list */}
      <div className="space-y-3">
        {documents.length === 0 ? (
          <EmptyState />
        ) : (
          documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onClick={() => router.push(`/documents/${doc.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
