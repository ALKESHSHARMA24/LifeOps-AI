import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle, Loader2, AlertCircle, FileText, ScanText, Copy, ChevronDown, ChevronUp, Pencil, X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateEntry { label: string; date: string; type: string; isImportant: boolean }
interface Entity { name: string; type: string; role?: string | null }
interface Amount { label: string; value: number; currency: string }

interface ExtractedData {
  title?: string;
  summary?: string;
  category?: string;
  dates?: DateEntry[];
  entities?: Entity[];
  amounts?: Amount[];
  [key: string]: unknown;
}

interface DocumentDetail {
  id: string;
  title: string | null;
  category: string | null;
  status: string;
  fileName: string;
  createdAt: string;
  extractedData: ExtractedData | null;
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

  // Edit state — a mutable copy of extractedData while editing
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<ExtractedData | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchDoc = (isInitial = false) => {
      api.get<{ document: DocumentDetail }>(`/documents/${id}`)
        .then(({ document }) => {
          if (cancelled) return;
          setDoc(document);
          // Keep polling while the server is still working on it
          if (document.status === "processing" || document.status === "uploaded") {
            pollTimer = setTimeout(() => fetchDoc(), 3000);
          }
        })
        .catch(() => {
          if (!cancelled) setError("Document not found");
        })
        .finally(() => {
          if (isInitial && !cancelled) setLoading(false);
        });
    };

    fetchDoc(true);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
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
    const dataToSave = editMode ? draft : doc?.extractedData;
    if (!dataToSave) return;
    setConfirming(true);
    setError("");
    try {
      const { document } = await api.post<{ document: DocumentDetail }>(`/documents/${id}/confirm`, {
        extractedData: dataToSave,
      });
      setDoc(document);
      setEditMode(false);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  };

  const startEdit = () => {
    if (!doc?.extractedData) return;
    setDraft(JSON.parse(JSON.stringify(doc.extractedData)));
    setEditMode(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditMode(false);
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

      {/* AI Extraction — review & confirm (with edit) */}
      {doc.status === "extracted" && extractedData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">AI Extraction — Review & Confirm</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Review the extracted data. Edit any incorrect fields before confirming.
                </p>
              </div>
              {!editMode ? (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode && draft ? (
              <ExtractionEditor draft={draft} onChange={setDraft} />
            ) : (
              <ExtractionPreview data={extractedData} />
            )}
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

// ─── Read-only preview ────────────────────────────────────────────────────────

function ExtractionPreview({ data }: { data: ExtractedData }) {
  const { title, summary, category, dates, entities, amounts } = data;

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

// ─── Editable form ────────────────────────────────────────────────────────────

function ExtractionEditor({ draft, onChange }: { draft: ExtractedData; onChange: (d: ExtractedData) => void }) {
  const set = (key: keyof ExtractedData, value: unknown) => onChange({ ...draft, [key]: value });

  const updateDate = (i: number, field: keyof DateEntry, value: string) => {
    const dates = [...(draft.dates ?? [])];
    dates[i] = { ...dates[i], [field]: value };
    set("dates", dates);
  };
  const removeDate = (i: number) => set("dates", draft.dates?.filter((_, idx) => idx !== i));
  const addDate = () => set("dates", [...(draft.dates ?? []), { label: "", date: "", type: "other", isImportant: false }]);

  const updateAmount = (i: number, field: keyof Amount, value: string | number) => {
    const amounts = [...(draft.amounts ?? [])];
    amounts[i] = { ...amounts[i], [field]: value };
    set("amounts", amounts);
  };
  const removeAmount = (i: number) => set("amounts", draft.amounts?.filter((_, idx) => idx !== i));
  const addAmount = () => set("amounts", [...(draft.amounts ?? []), { label: "", value: 0, currency: "INR" }]);

  const updateEntity = (i: number, field: keyof Entity, value: string) => {
    const entities = [...(draft.entities ?? [])];
    entities[i] = { ...entities[i], [field]: value };
    set("entities", entities);
  };
  const removeEntity = (i: number) => set("entities", draft.entities?.filter((_, idx) => idx !== i));
  const addEntity = () => set("entities", [...(draft.entities ?? []), { name: "", type: "other", role: "" }]);

  return (
    <div className="space-y-5 text-sm">
      {/* Title */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Title</label>
        <Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Document title" />
      </div>

      {/* Category */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Category</label>
        <Input value={draft.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="e.g. insurance, vehicle, finance" />
      </div>

      {/* Summary */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Summary</label>
        <textarea
          value={draft.summary ?? ""}
          onChange={(e) => set("summary", e.target.value)}
          rows={3}
          placeholder="Brief summary of the document"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      {/* Dates */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Important Dates</p>
          <Button type="button" variant="ghost" size="sm" onClick={addDate}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <div className="space-y-2">
          {(draft.dates ?? []).map((d, i) => (
            <div key={i} className={cn("grid grid-cols-[1fr_1fr_auto] gap-2 rounded bg-muted p-2")}>
              <Input value={d.label} onChange={(e) => updateDate(i, "label", e.target.value)} placeholder="Label (e.g. Expiry)" />
              <Input value={d.date} onChange={(e) => updateDate(i, "date", e.target.value)} placeholder="Date (e.g. 2025-12-31)" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeDate(i)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Amounts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amounts</p>
          <Button type="button" variant="ghost" size="sm" onClick={addAmount}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <div className="space-y-2">
          {(draft.amounts ?? []).map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 rounded bg-muted p-2">
              <Input value={a.label} onChange={(e) => updateAmount(i, "label", e.target.value)} placeholder="Label" />
              <Input type="number" value={a.value} onChange={(e) => updateAmount(i, "value", parseFloat(e.target.value) || 0)} placeholder="Amount" />
              <Input value={a.currency} onChange={(e) => updateAmount(i, "currency", e.target.value)} placeholder="INR" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAmount(i)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Entities */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entities</p>
          <Button type="button" variant="ghost" size="sm" onClick={addEntity}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <div className="space-y-2">
          {(draft.entities ?? []).map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded bg-muted p-2">
              <Input value={e.name} onChange={(ev) => updateEntity(i, "name", ev.target.value)} placeholder="Name" />
              <Input value={e.role ?? e.type} onChange={(ev) => updateEntity(i, "role", ev.target.value)} placeholder="Role / type" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeEntity(i)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
