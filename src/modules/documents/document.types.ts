import type { ExtractionResult } from "@/ai/extraction";

// What we return to the client after upload/processing
export interface DocumentWithExtraction {
  id: string;
  userId: string;
  title: string | null;
  originalFilename: string;
  filePath: string;
  fileType: string;
  fileSizeBytes: number | null;
  category: string | null;
  subcategory: string | null;
  status: string;
  extractedData: ExtractionResult | null;
  processingError: string | null;
  confidenceScore: string | null;
  createdAt: Date;
  updatedAt: Date;
}
