import { Router, Request, Response } from "express";
import fs from "fs";
import { requireAuth } from "../middleware/auth";
import { ocrImage, ocrScannedPdf } from "../../src/ai/ocr";
import { getDocument } from "../../src/modules/documents/document.service";
import { db } from "../../src/db";
import { documents } from "../../src/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// GET /api/ocr/:documentId — return raw OCR text for a stored document
router.get("/:documentId", requireAuth, async (req: Request, res: Response) => {
  const doc = await getDocument(req.user!.id, req.params.documentId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // If rawText is already stored in DB, return it immediately (no API call)
  if (doc.rawText) {
    res.json({ text: doc.rawText, source: "cached", documentId: doc.id });
    return;
  }

  // Otherwise read the file and OCR it fresh
  try {
    if (!doc.filePath || !fs.existsSync(doc.filePath)) {
      res.status(404).json({ error: "Document file not found on disk" });
      return;
    }

    const buffer = fs.readFileSync(doc.filePath);
    const isPdf = doc.originalFilename?.endsWith(".pdf") || doc.filePath.endsWith(".pdf");

    const result = isPdf
      ? await ocrScannedPdf(buffer)
      : await ocrImage(buffer, "image/jpeg");

    if (!result.success) {
      res.status(422).json({ error: result.error });
      return;
    }

    // Cache the result in DB so next call is instant
    await db.update(documents)
      .set({ rawText: result.text, updatedAt: new Date() })
      .where(and(eq(documents.id, doc.id), eq(documents.userId, req.user!.id)));

    res.json({ text: result.text, source: result.method, documentId: doc.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR failed";
    res.status(500).json({ error: message });
  }
});

// POST /api/ocr/upload — OCR a file directly (without saving it as a document)
router.post("/upload", requireAuth, async (req: Request, res: Response) => {
  // Expects JSON body: { fileBase64: string, mimeType: string }
  const { fileBase64, mimeType } = req.body;

  if (!fileBase64 || !mimeType) {
    res.status(400).json({ error: "fileBase64 and mimeType are required" });
    return;
  }

  try {
    const buffer = Buffer.from(fileBase64, "base64");
    const isPdf = mimeType === "application/pdf";

    const result = isPdf
      ? await ocrScannedPdf(buffer)
      : await ocrImage(buffer, mimeType);

    if (!result.success) {
      res.status(422).json({ error: result.error });
      return;
    }

    res.json({ text: result.text, method: result.method });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR failed";
    res.status(500).json({ error: message });
  }
});

export default router;
