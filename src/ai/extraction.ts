/**
 * Document Extraction Pipeline
 *
 * LEARNING NOTE: The flow is:
 * 1. Get text from the document (PDF → text extraction, image → send to vision model)
 * 2. Send text + prompt to the AI provider
 * 3. Parse the JSON response
 * 4. Validate the shape with Zod (never trust raw AI output)
 * 5. Return the validated data or a graceful error
 */

import { z } from "zod";
import { generateJSON, isProviderConfigured } from "./provider";
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
} from "./prompts/extraction";

// ─── Zod Schema ───────────────────────────────────────────────────────────────
// This is the single source of truth for what a valid extraction looks like.

const DateEntrySchema = z.object({
  label: z.string(),
  date: z.string(),
  type: z.enum(["expiry", "issue", "payment", "renewal", "start", "end", "action", "other"]),
  isImportant: z.boolean().default(false),
});

const EntitySchema = z.object({
  type: z.enum(["vehicle", "home", "device", "person", "organization", "other"]),
  name: z.string(),
  role: z.string().nullable().default(null),
  attributes: z.record(z.string(), z.string()).default({}),
});

const FinancialSchema = z.object({
  label: z.string(),
  amount: z.number(),
  currency: z.string().default("INR"),
});

const KeyFactSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
});

export const ExtractionResultSchema = z.object({
  category: z.string().default("other"),
  subcategory: z.string().nullable().default(null),
  title: z.string().default("Untitled Document"),
  summary: z.string().default(""),
  issueDate: z.string().nullable().default(null),
  dates: z.array(DateEntrySchema).default([]),
  entities: z.array(EntitySchema).default([]),
  financials: z.array(FinancialSchema).default([]),
  keyFacts: z.array(KeyFactSchema).default([]),
  suggestedActions: z.array(z.string()).default([]),
  overallConfidence: z.number().min(0).max(1).default(0.5),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ─── Text Extraction from PDF ─────────────────────────────────────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import avoids Next.js bundling issues with pdf-parse
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export type ExtractionInput =
  | { type: "pdf"; buffer: Buffer }
  | { type: "image"; buffer: Buffer; mimeType: string };

export interface ExtractionOutput {
  success: boolean;
  data: ExtractionResult | null;
  rawText: string;         // the text we sent to the model (stored for audit)
  error: string | null;
  model: string;
}

export async function extractDocumentData(
  input: ExtractionInput
): Promise<ExtractionOutput> {
  if (!isProviderConfigured()) {
    return {
      success: false,
      data: null,
      rawText: "",
      error: "AI provider API key not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local",
      model: "none",
    };
  }

  try {
    let rawJSON: string;
    let rawText = "";

    if (input.type === "pdf") {
      // Step 1: Extract text from the PDF
      rawText = await extractTextFromPDF(input.buffer);

      if (!rawText.trim()) {
        return {
          success: false,
          data: null,
          rawText: "",
          error: "Could not extract text from this PDF. It may be a scanned image.",
          model: "pdf-parse",
        };
      }

      // Truncate to ~12k chars to avoid blowing the context window
      const truncated = rawText.slice(0, 12000);

      // Step 2: Send text to AI for structured extraction
      rawJSON = await generateJSON(EXTRACTION_USER_PROMPT, {
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        text: `DOCUMENT TEXT:\n${truncated}`,
      });
    } else {
      // For images, send directly to the vision model — no OCR step needed
      rawJSON = await generateJSON(EXTRACTION_USER_PROMPT, {
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        image: { buffer: input.buffer, mimeType: input.mimeType },
        text: "The image above is a personal document. Extract all information from it.",
      });
    }

    // Step 3: Parse JSON
    const parsed = JSON.parse(rawJSON);

    // Step 4: Validate with Zod — this catches hallucinated fields or wrong types
    const validated = ExtractionResultSchema.parse(parsed);

    return {
      success: true,
      data: validated,
      rawText,
      error: null,
      model: process.env.AI_PROVIDER === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown extraction error";
    return {
      success: false,
      data: null,
      rawText: "",
      error: `Extraction failed: ${message}`,
      model: "unknown",
    };
  }
}
