/**
 * Embedding service — takes text chunks and writes them to document_chunks.
 *
 * Rate limiting note: Gemini text-embedding-004 free tier allows 1500 req/min.
 * We batch with a small delay to stay well under that for large documents.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentChunks } from "@/db/schema";
import { generateEmbedding } from "./provider";
import { type TextChunk } from "./chunking";

const BATCH_SIZE = 10; // embed N chunks at a time before inserting
const BATCH_DELAY_MS = 500; // pause between batches (rate limit safety)

export interface EmbedChunksInput {
  userId: string;
  documentId: string;
  chunks: TextChunk[];
  metadata?: Record<string, unknown>;
}

/**
 * Embed all chunks for a document and persist them to the DB.
 * Replaces any existing chunks for this document first.
 */
export async function embedAndStoreChunks(input: EmbedChunksInput): Promise<void> {
  const { userId, documentId, chunks, metadata = {} } = input;

  // Remove stale chunks before re-indexing
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const rows = await Promise.all(
      batch.map(async (chunk) => {
        const embedding = await generateEmbedding(chunk.content);
        return {
          documentId,
          userId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          embedding,
          metadata: { ...metadata },
        };
      })
    );

    await db.insert(documentChunks).values(rows);

    // Avoid hitting rate limits on free tier
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
}
