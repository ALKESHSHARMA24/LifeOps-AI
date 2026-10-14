/**
 * Text chunking for RAG.
 *
 * Strategy: recursive character splitting.
 * - Target ~400 tokens per chunk (~1600 chars assuming ~4 chars/token)
 * - 80-char overlap so context doesn't cut off mid-sentence
 * - Split on paragraph → sentence → word boundaries, in that order
 */

const CHUNK_SIZE = 1600;   // characters (~400 tokens)
const CHUNK_OVERLAP = 320; // characters (~80 tokens)

export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number; // rough estimate: chars / 4
}

/**
 * Split a long document text into overlapping chunks.
 */
export function chunkText(text: string): TextChunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  const rawChunks = splitRecursive(cleaned, CHUNK_SIZE, CHUNK_OVERLAP);

  return rawChunks
    .filter((c) => c.trim().length > 20) // skip very short fragments
    .map((content, chunkIndex) => ({
      content: content.trim(),
      chunkIndex,
      tokenCount: Math.ceil(content.length / 4),
    }));
}

// ─── Internal ────────────────────────────────────────────────────────────────

const SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", ", ", " ", ""];

function splitRecursive(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];

  // Find the best separator that exists in this text
  const sep = SEPARATORS.find((s) => s === "" || text.includes(s)) ?? "";

  const parts = sep ? text.split(sep) : text.split("");
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? current + sep + part : part;

    if (candidate.length <= size) {
      current = candidate;
    } else {
      if (current) {
        chunks.push(current);
        // Carry over overlap: take the tail of 'current'
        const tail = current.slice(Math.max(0, current.length - overlap));
        current = tail ? tail + sep + part : part;
      } else {
        // Single part is already bigger than size — recurse with next separator
        const sub = splitRecursive(part, size, overlap);
        chunks.push(...sub.slice(0, -1));
        current = sub[sub.length - 1] ?? "";
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
