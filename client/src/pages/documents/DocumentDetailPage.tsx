import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Loader2, AlertCircle, FileText, ScanText, Copy, ChevronDown, ChevronUp } from "lucide-react";

interface DocumentDetail {
  id: string;
  title: string | null;
  category: string | null;
  status: string;
  fileName: string;
  createdAt: string;
  // extractedData is a flat field on the document (jsonb column in DB)
  extractedData: Record<string, unknown> | null;
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrExpanded, setOcrExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<{ document: DocumentDetail }>(`/documents/${id}`)
      .then(({ document }) => setDoc(document))
      .catch(() => setError("Document not found"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleOcr = async () => {
    setOcrLoading(true);
    setOcrError("");
    setOcrExpanded(true);
    try {
      const res = await api.get<{ text: string; source: string }>(`/ocr/${id}`);
      setOcrText(res.text);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "OCR failed");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCopyOcr = () => {
    if (ocrText) navigator.clipboard.writeText(ocrText);
  };

  const handleConfirm = async () => {
    if (!doc?.extractedData) return;
    setConfirming(true);
    setError("");
    try {
      const { document } = await api.post<{ document: DocumentDetail }>(`/documents/${id}/confirm`, {
        extractedData: doc.extractedData,
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

  const extractedData = doc.extractedData;

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

      {/* AI Extraction — review & confirm */}
      {doc.status === "extracted" && extractedData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Extraction — Review & Confirm</CardTitle>
            <p className="text-sm text-muted-foreground">
              LifeOps has extracted the following data. Review it and confirm to save entities and deadlines.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExtractionPreview data={extractedData} />
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-2" /> Confirm & Save</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Indexed / confirmed */}
      {(doc.status === "indexed" || doc.status === "validated") && (
        <Card>
          <CardContent className="py-6 flex items-center gap-3 text-green-700">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Document indexed and ready</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Searchable and available for AI chat queries.
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

      {/* Show extracted data on confirmed/indexed docs too */}
      {extractedData && doc.status !== "extracted" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Extracted Data</CardTitle></CardHeader>
          <CardContent>
            <ExtractionPreview data={extractedData} />
          </CardContent>
        </Card>
      )}

      {/* OCR — Raw Text */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ScanText className="h-4 w-4" /> Raw Text (OCR)
            </CardTitle>
            <div className="flex items-center gap-2">
              {ocrText && (
                <Button variant="ghost" size="sm" onClick={handleCopyOcr} title="Copy to clipboard">
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={ocrText ? () => setOcrExpanded((v) => !v) : handleOcr}
                disabled={ocrLoading}
              >
                {ocrLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running OCR…</>
                ) : ocrText ? (
                  ocrExpanded ? (
                    <><ChevronUp className="h-4 w-4 mr-2" /> Hide</>
                  ) : (
                    <><ChevronDown className="h-4 w-4 mr-2" /> View</>
                  )
                ) : (
                  <><ScanText className="h-4 w-4 mr-2" /> Run OCR</>
                )}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Extract the raw text from your document using AI vision.
          </p>
        </CardHeader>
        {ocrExpanded && (
          <CardContent>
            {ocrError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-3">
                <AlertCircle className="h-4 w-4 shrink-0" /> {ocrError}
              </div>
            )}
            {ocrText && (
              <pre className="max-h-96 overflow-y-auto rounded-md bg-muted px-4 py-3 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">
                {ocrText}
              </pre>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// Renders extracted fields in a human-readable way instead of raw JSON
function ExtractionPreview({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string | undefined;
  const summary = data.summary as string | undefined;
  const category = data.category as string | undefined;
  const dates = data.dates as Array<{ date: string; label: string; type: string; isImportant: boolean }> | undefined;
  const entities = data.entities as Array<{ name: string; type: string; role?: string }> | undefined;
  const amounts = data.amounts as Array<{ value: number; currency: string; label: string }> | undefined;

  return (
    <div className="space-y-4 text-sm">
      {title && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Title</p>
          <p className="font-medium">{title}</p>
        </div>
      )}
      {summary && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
          <p className="text-muted-foreground leading-relaxed">{summary}</p>
        </div>
      )}
      {category && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Category</p>
          <p className="capitalize">{category}</p>
        </div>
      )}
      {dates && dates.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Important Dates</p>
          <div className="space-y-1">
            {dates.map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-muted px-3 py-2">
                <span>{d.label}</span>
                <span className="font-medium">{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {amounts && amounts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Amounts</p>
          <div className="space-y-1">
            {amounts.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-muted px-3 py-2">
                <span>{a.label}</span>
                <span className="font-medium">{a.currency} {a.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {entities && entities.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Entities</p>
          <div className="space-y-1">
            {entities.map((e, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-muted px-3 py-2">
                <span>{e.name}</span>
                <span className="text-muted-foreground capitalize">{e.role ?? e.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
