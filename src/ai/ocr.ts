/**
 * OCR Module — extract raw text from images and PDFs using vision AI.
 *
 * This is different from extraction.ts:
 *   - extraction.ts  → returns structured JSON (title, dates, entities, etc.)
 *   - ocr.ts         → returns raw plain text only, like a photocopier reading text
 *
 * Used as a fallback when pdf-parse returns empty (scanned/image-based PDFs),
 * and as a standalone endpoint for users who just want the raw text.
 */

import { getActiveProvider } from "./provider";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const OCR_PROMPT = `You are an OCR engine. Your ONLY job is to read and return the exact text visible in this document.

Rules:
- Return ONLY the raw text, exactly as it appears
- Preserve the original structure (line breaks, paragraphs, tables)
- Do NOT summarize, analyze, or add any commentary
- Do NOT add labels like "Text:" or "Content:"
- If you cannot read something clearly, write [illegible]
- Include ALL text: headings, body, fine print, watermarks, numbers, dates`;

export interface OcrResult {
  success: boolean;
  text: string;
  pageCount?: number;
  error?: string;
  method: "vision-openai" | "vision-gemini" | "pdf-parse" | "failed";
}

// ─── OCR an image buffer ──────────────────────────────────────────────────────

export async function ocrImage(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const provider = getActiveProvider();

  try {
    if (provider === "openai") {
      return await ocrImageWithOpenAI(buffer, mimeType);
    }
    return await ocrImageWithGemini(buffer, mimeType);
  } catch (err) {
    return {
      success: false,
      text: "",
      error: err instanceof Error ? err.message : "OCR failed",
      method: "failed",
    };
  }
}

// ─── OCR a scanned PDF (no text layer) via vision model ──────────────────────
// Gemini accepts PDFs natively; OpenAI does not (images only).

export async function ocrScannedPdf(buffer: Buffer): Promise<OcrResult> {
  const provider = getActiveProvider();

  if (provider === "gemini") {
    return await ocrPdfWithGemini(buffer);
  }

  // OpenAI doesn't accept PDF bytes — return a helpful fallback
  return {
    success: false,
    text: "",
    error:
      "This PDF appears to be a scanned image. OpenAI cannot read PDF images directly. " +
      "Try uploading a photo (JPEG/PNG) of the document instead, or switch AI_PROVIDER=gemini.",
    method: "failed",
  };
}

// ─── OpenAI Vision OCR ────────────────────────────────────────────────────────

async function ocrImageWithOpenAI(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const openai = new OpenAI({ apiKey });
  const base64 = buffer.toString("base64");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ],
      },
    ],
    max_tokens: 4000,
  });

  const text = response.choices[0].message.content ?? "";
  return { success: true, text, method: "vision-openai" };
}

// ─── Gemini Vision OCR (images) ───────────────────────────────────────────────

async function ocrImageWithGemini(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent([
    OCR_PROMPT,
    { inlineData: { data: buffer.toString("base64"), mimeType } },
  ]);

  const text = result.response.text();
  return { success: true, text, method: "vision-gemini" };
}

// ─── Gemini PDF OCR (Gemini accepts PDF natively) ────────────────────────────

async function ocrPdfWithGemini(buffer: Buffer): Promise<OcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent([
    OCR_PROMPT,
    { inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } },
  ]);

  const text = result.response.text();
  return { success: true, text, method: "vision-gemini" };
}
