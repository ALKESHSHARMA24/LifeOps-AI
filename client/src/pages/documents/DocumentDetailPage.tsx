import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Loader2, AlertCircle, FileText } from "lucide-react";

interface DocumentDetail {
  id: string;
  title: string | null;
  category: string | null;
  status: string;
  fileName: string;
  createdAt: string;
  extraction?: {
    extractedData: Record<string, unknown> | null;
  };
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get<{ document: DocumentDetail }>(`/documents/${id}`)
      .then(({ document }) => setDoc(document))
      .catch(() => setError("Document not found"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleConfirm = async () => {
    if (!doc?.extraction?.extractedData) return;
    setConfirming(true);
    setError("");
    try {
      const { document } = await api.post<{ document: DocumentDetail }>(`/documents/${id}/confirm`, {
        extractedData: doc.extraction.extractedData,
      });
      setDoc(document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="text-destructive">{error || "Document not found"}</p>
      </div>
    );
  }

  const extractedData = doc.extraction?.extractedData;

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Documents
      </Button>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">{doc.title ?? doc.fileName}</h1>
            <p className="text-sm text-muted-foreground">{doc.category ?? "Uncategorized"}</p>
          </div>
        </div>
        <Badge>{doc.status}</Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* AI Extraction — show if extracted and pending confirmation */}
      {doc.status === "extracted" && extractedData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Extraction — Review & Confirm</CardTitle>
            <p className="text-sm text-muted-foreground">
              LifeOps has extracted the following data. Review it and confirm to save entities and deadlines.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-96">
              {JSON.stringify(extractedData, null, 2)}
            </pre>
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-2" /> Confirm Extraction</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Already indexed */}
      {(doc.status === "indexed" || doc.status === "validated") && (
        <Card>
          <CardContent className="py-6 flex items-center gap-3 text-green-700">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Document indexed and ready</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                This document is searchable and available for AI chat queries.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing */}
      {doc.status === "processing" && (
        <Card>
          <CardContent className="py-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">AI is processing your document…</p>
          </CardContent>
        </Card>
      )}

      {extractedData && doc.status !== "extracted" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Extracted Data</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-96">
              {JSON.stringify(extractedData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
