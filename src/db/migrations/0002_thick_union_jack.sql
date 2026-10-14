-- Switching embedding provider from Gemini (768-dim) to OpenAI text-embedding-3-small (1536-dim)
-- All existing chunks must be deleted and re-indexed after this migration.
TRUNCATE TABLE "document_chunks";
ALTER TABLE "document_chunks" DROP COLUMN "embedding";
ALTER TABLE "document_chunks" ADD COLUMN "embedding" vector(1536);
