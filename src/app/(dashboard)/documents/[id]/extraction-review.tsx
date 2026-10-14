"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  Tag,
  ArrowLeft,
  Loader2,
  Info,
  FileText,
} from "lucide-react";
import type { DocumentWithExtraction } from "@/modules/documents/document.types";
import type { ExtractionResult } from "@/ai/extraction";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === "high") return <Badge variant="success">High confidence</Badge>;
  if (confidence === "medium") return <Badge variant="warning">Medium confidence</Badge>;
  return <Badge variant="destructive">Low confidence — please verify</Badge>;
}

function StatusMessage({ doc }: { doc: DocumentWithExtraction }) {
  if (doc.status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm text-destructive">AI extraction failed</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {doc.processingError ?? "Unknown error"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            The original file is saved. You can still confirm the document manually.
          </p>
        </div>
      </div>
    );
  }

  if (doc.status === "validated") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 px-4 py-3">
        <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          This document has been confirmed and its commitments are tracked.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
      <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-sm">Review the AI-extracted information below</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Confidence: {doc.confidenceScore ? Math.round(Number(doc.confidenceScore) * 100) : "—"}%
          {" · "} Confirm when correct, or edit the document title/details before confirming.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExtractionReview({ document: doc }: { document: DocumentWithExtraction }) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const extracted = doc.extractedData as ExtractionResult | null;

  async function handleConfirm() {
    if (!extracted) return;
    setError("");
    setIsConfirming(true);

    const res = await fetch(`/api/documents/${doc.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extractedData: extracted }),
    });

    const data = await res.json();
    setIsConfirming(false);

    if (!res.ok) {
      setError(data.error ?? "Confirmation failed");
      return;
    }

    router.push("/documents");
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/documents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {doc.title ?? doc.originalFilename}
          </h1>
          <p className="text-sm text-muted-foreground">
            {doc.originalFilename} ·{" "}
            {new Date(doc.createdAt).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </p>
        </div>
        {doc.category && (
          <Badge variant="info" className="capitalize shrink-0">
            {doc.category}
          </Badge>
        )}
      </div>

      {/* Status message */}
      <StatusMessage doc={doc} />

      {/* Extraction failed — show fallback */}
      {!extracted && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No extracted data available.</p>
            <p className="text-xs mt-1">The original file is stored safely.</p>
          </CardContent>
        </Card>
      )}

      {/* Extracted data */}
      {extracted && (
        <div className="space-y-4">
          {/* Summary */}
          {extracted.summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" /> Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{extracted.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Key Facts */}
          {extracted.keyFacts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Key Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {extracted.keyFacts.map((fact, i) => (
                    <div key={i} className="flex items-center justify-between py-2 gap-4">
                      <span className="text-sm text-muted-foreground shrink-0">{fact.key}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{fact.value}</span>
                        {fact.confidence !== "high" && (
                          <ConfidenceBadge confidence={fact.confidence} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Important Dates */}
          {extracted.dates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Dates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {extracted.dates.map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{d.label}</span>
                        {d.isImportant && (
                          <Badge variant="warning" className="text-xs">Reminder will be set</Badge>
                        )}
                      </div>
                      <span className="text-sm font-medium tabular-nums">
                        {new Date(d.date).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financials */}
          {extracted.financials.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Financial Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {extracted.financials.map((f, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{f.label}</span>
                      <span className="text-sm font-semibold">
                        {f.currency} {f.amount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entities */}
          {extracted.entities.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Related Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {extracted.entities.map((entity, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Badge variant="secondary" className="capitalize shrink-0 mt-0.5">
                        {entity.type}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{entity.name}</p>
                        {Object.entries(entity.attributes).slice(0, 3).map(([k, v]) => (
                          <p key={k} className="text-xs text-muted-foreground">
                            {k}: {v}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Suggested actions */}
          {extracted.suggestedActions.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-primary">Suggested Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {extracted.suggestedActions.map((action, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {action}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      {doc.status === "extracted" && extracted && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="flex items-center gap-2"
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {isConfirming ? "Confirming…" : "Confirm & Save"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/documents")}>
            Review later
          </Button>
          <p className="text-xs text-muted-foreground">
            Confirming will create deadline reminders for important dates.
          </p>
        </div>
      )}
    </div>
  );
}
