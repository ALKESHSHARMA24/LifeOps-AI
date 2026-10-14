-- Drop and re-add embedding column as vector(768)
-- Safe because document_chunks is empty at this point (Phase 2 migration)
ALTER TABLE "document_chunks" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "raw_text" text;
