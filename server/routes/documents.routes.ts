import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import {
  uploadAndProcessDocument,
  listDocuments,
  getDocument,
  confirmDocumentExtraction,
} from "../../src/modules/documents/document.service";
import { createEntitiesFromExtraction } from "../../src/modules/entities/entity.service";
import { createCommitmentsFromExtraction } from "../../src/modules/commitments/commitment.service";
import { ExtractionResultSchema } from "../../src/ai/extraction";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Configure multer for file uploads
const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "20") * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/documents — upload a document
router.post("/", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided or unsupported type" });
    return;
  }

  try {
    // Convert multer file to File-like object that the service expects
    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });
    const file = new File([blob], req.file.originalname, { type: req.file.mimetype });

    const document = await uploadAndProcessDocument(req.user!.id, file);
    res.status(201).json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    res.status(400).json({ error: message });
  } finally {
    // Clean up temp file
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

// GET /api/documents — list all documents
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const docs = await listDocuments(req.user!.id);
  res.json({ documents: docs });
});

// GET /api/documents/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const doc = await getDocument(req.user!.id, req.params.id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ document: doc });
});

// POST /api/documents/:id/confirm — confirm AI extraction
router.post("/:id/confirm", requireAuth, async (req: Request, res: Response) => {
  const parsed = ExtractionResultSchema.safeParse(req.body.extractedData);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid extraction data", details: parsed.error.flatten() });
    return;
  }

  try {
    const userId = req.user!.id;
    const documentId = req.params.id;
    const confirmedData = parsed.data;

    const doc = await confirmDocumentExtraction(userId, documentId, confirmedData);
    await createEntitiesFromExtraction(userId, documentId, confirmedData);
    await createCommitmentsFromExtraction(userId, documentId, confirmedData);

    res.json({ document: doc, message: "Document confirmed. Entities and commitments created." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Confirmation failed";
    res.status(500).json({ error: message });
  }
});

export default router;
