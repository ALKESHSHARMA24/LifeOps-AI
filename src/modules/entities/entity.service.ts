import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { entities, documentEntities } from "@/db/schema";
import type { ExtractionResult } from "@/ai/extraction";

/**
 * After the user confirms a document, we create Entity records for the
 * real-world objects mentioned in it (vehicle, device, home, etc.)
 * and link them to the document via document_entities.
 */
export async function createEntitiesFromExtraction(
  userId: string,
  documentId: string,
  extraction: ExtractionResult
): Promise<void> {
  for (const extracted of extraction.entities) {
    // Check if this entity already exists for this user
    // (simple name match — Phase 5 will use smarter deduplication)
    const [existing] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(
        and(
          eq(entities.userId, userId),
          eq(entities.name, extracted.name)
        )
      )
      .limit(1);

    let entityId: string;

    if (existing) {
      entityId = existing.id;
    } else {
      const [created] = await db
        .insert(entities)
        .values({
          userId,
          type: extracted.type as "vehicle" | "home" | "device" | "person" | "subscription" | "other",
          name: extracted.name,
          attributes: extracted.attributes,
        })
        .returning({ id: entities.id });

      entityId = created.id;
    }

    // Link this document to the entity
    await db
      .insert(documentEntities)
      .values({
        documentId,
        entityId,
        relationshipType: extracted.role ?? undefined,
      })
      .onConflictDoNothing();
  }
}
