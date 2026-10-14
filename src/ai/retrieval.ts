/**
 * RAG Retrieval — vector similarity search using pgvector.
 *
 * Flow:
 *   1. Embed the user's query text
 *   2. Run cosine similarity search against document_chunks
 *   3. Filter by userId (mandatory — users can't see each other's docs)
 *   4. Return top-k chunks with their source document info
 */

import { sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { documentChunks, documents } from "@/db/schema";
import { generateEmbedding } from "./provider";

export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  category: string | null;
  content: string;
  chunkIndex: number;
  similarity: number; // 0–1, higher is better
}

export interface RetrieveOptions {
  userId: string;
  query: string;
  topK?: number;          // default 5
  minSimilarity?: number; // default 0.5 — filter out weak matches
  category?: string;      // optional category filter
}

/**
 * Semantic search over the user's document chunks.
 */
export async function retrieveChunks(opts: RetrieveOptions): Promise<RetrievalResult[]> {
  const { userId, query, topK = 5, minSimilarity = 0.5, category } = opts;

  const queryEmbedding = await generateEmbedding(query);
  // Format as pgvector literal: [0.1,0.2,...]
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  // pgvector cosine similarity: 1 - (embedding <=> query_vector)
  // <=> returns cosine DISTANCE (0 = identical, 2 = opposite)
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      documentId: documentChunks.documentId,
      documentTitle: documents.title,
      category: documents.category,
      content: documentChunks.content,
      chunkIndex: documentChunks.chunkIndex,
      distance: sql<number>`(${documentChunks.embedding} <=> ${sql.raw(`'${embeddingLiteral}'::vector`)})`,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documentChunks.userId, userId),
        category ? eq(documents.category, category) : undefined
      )
    )
    .orderBy(sql`${documentChunks.embedding} <=> ${sql.raw(`'${embeddingLiteral}'::vector`)}`)
    .limit(topK * 2); // fetch more then filter by minSimilarity

  return rows
    .map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      category: row.category,
      content: row.content,
      chunkIndex: row.chunkIndex,
      similarity: 1 - row.distance, // convert distance to similarity
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .slice(0, topK);
}
