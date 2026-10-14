import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { saveUploadedFile, validateFileSize, getAllowedMimeTypes } from "@/lib/storage";
import { extractDocumentData } from "@/ai/extraction";
import type { ExtractionResult } from "@/ai/extraction";
import { chunkText } from "@/ai/chunking";
import { embedAndStoreChunks } from "@/ai/embedding";
import type { DocumentWithExtraction } from "./document.types";

// ─── Upload + Process ─────────────────────────────────────────────────────────

export async function uploadAndProcessDocument(
  userId: string,
  file: File
): Promise<DocumentWithExtraction> {
  // 1. Validate type
  const allowedTypes = getAllowedMimeTypes();
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      `Unsupported file type: ${file.type}. Allowed: PDF, JPEG, PNG, WebP`
    );
  }

  // 2. Validate size
  const sizeError = validateFileSize(file.size);
  if (sizeError) throw new Error(sizeError);

  // 3. Read file into a buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Save the original file to disk (always preserved — source of truth)
  const { filePath, docId } = await saveUploadedFile(
    userId,
    buffer,
    file.name,
    file.type
  );

  // 5. Create the initial DB record (status: uploaded)
  const [doc] = await db
    .insert(documents)
    .values({
      id: docId,
      userId,
      originalFilename: file.name,
      filePath,
      fileType: file.type,
      fileSizeBytes: file.size,
      status: "uploaded",
    })
    .returning();

  // 6. Run AI extraction (synchronous for MVP — Phase 4 will move this to a worker queue)
  await db
    .update(documents)
    .set({ status: "processing" })
    .where(eq(documents.id, docId));

  const extraction = await extractDocumentData(
    file.type === "application/pdf"
      ? { type: "pdf", buffer }
      : { type: "image", buffer, mimeType: file.type }
  );

  // 7. Update the record with extracted data + raw text (for chunking in Phase 2)
  if (extraction.success && extraction.data) {
    const [updated] = await db
      .update(documents)
      .set({
        status: "extracted",
        title: extraction.data.title,
        category: extraction.data.category,
        subcategory: extraction.data.subcategory,
        extractedData: extraction.data,
        rawText: extraction.rawText || null,
        aiModel: extraction.model,
        confidenceScore: String(extraction.data.overallConfidence),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, docId))
      .returning();

    return updated as DocumentWithExtraction;
  } else {
    // AI failed — keep the document, mark it for manual review
    const [updated] = await db
      .update(documents)
      .set({
        status: "error",
        processingError: extraction.error,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, docId))
      .returning();

    return updated as DocumentWithExtraction;
  }
}

// ─── List Documents ───────────────────────────────────────────────────────────

export async function listDocuments(userId: string): Promise<DocumentWithExtraction[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));

  return rows as DocumentWithExtraction[];
}

// ─── Get Single Document ──────────────────────────────────────────────────────

export async function getDocument(
  userId: string,
  documentId: string
): Promise<DocumentWithExtraction | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .limit(1);

  return (doc as DocumentWithExtraction) ?? null;
}

// ─── Confirm Extraction ───────────────────────────────────────────────────────
// Called when the user reviews and confirms the AI-extracted data

export async function confirmDocumentExtraction(
  userId: string,
  documentId: string,
  confirmedData: ExtractionResult
): Promise<DocumentWithExtraction> {
  // 1. Mark as validated and update confirmed data
  const [validated] = await db
    .update(documents)
    .set({
      status: "validated",
      extractedData: confirmedData,
      title: confirmedData.title,
      category: confirmedData.category,
      subcategory: confirmedData.subcategory,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .returning();

  if (!validated) throw new Error("Document not found");

  // 2. Chunk + embed the raw text and persist to document_chunks
  //    This runs asynchronously but we await it so the caller knows indexing finished.
  if (validated.rawText) {
    const chunks = chunkText(validated.rawText);
    if (chunks.length > 0) {
      await embedAndStoreChunks({
        userId,
        documentId,
        chunks,
        metadata: {
          category: validated.category,
          title: validated.title,
        },
      });

      // Mark as indexed once embedding is done
      const [indexed] = await db
        .update(documents)
        .set({ status: "indexed", updatedAt: new Date() })
        .where(eq(documents.id, documentId))
        .returning();

      return indexed as DocumentWithExtraction;
    }
  }

  return validated as DocumentWithExtraction;
}
