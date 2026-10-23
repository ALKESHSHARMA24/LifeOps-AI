import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Upload, Loader2, AlertCircle } from "lucide-react";

interface Document {
  id: string;
  title: string | null;
  category: string | null;
  status: string;
  createdAt: string;
  fileName: string;
}

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "success" | "destructive" | "info" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  processing: { label: "Processing…", variant: "info" },
  extracted: { label: "Needs Review", variant: "warning" },
  validated: { label: "Confirmed", variant: "secondary" },
  indexed: { label: "Indexed", variant: "success" },
  error: { label: "Error", variant: "destructive" },
};

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    api.get<{ documents: Document[] }>("/documents")
      .then(({ documents }) => setDocuments(documents))
      .catch(() => {});
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload("/documents", formData);
      fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground mt-1">Upload and manage your personal documents</p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading ? "Processing…" : "Upload Document"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No documents yet</p>
            <p className="text-muted-foreground mt-1">Upload your first document to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const status = statusBadge[doc.status] ?? { label: doc.status, variant: "secondary" as const };
            return (
              <Link key={doc.id} to={`/documents/${doc.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-medium">{doc.title ?? doc.fileName}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.category ?? "Uncategorized"} · {new Date(doc.createdAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
