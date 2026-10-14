import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { confirmDocumentExtraction } from "@/modules/documents/document.service";
import { createEntitiesFromExtraction } from "@/modules/entities/entity.service";
import { createCommitmentsFromExtraction } from "@/modules/commitments/commitment.service";
import { ExtractionResultSchema } from "@/ai/extraction";

// POST /api/documents/[id]/confirm
// User has reviewed the AI extraction and confirmed (or corrected) it.
// This triggers entity + commitment creation.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Validate the confirmed data with the same Zod schema used during extraction
    const parsed = ExtractionResultSchema.safeParse(body.extractedData);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid extraction data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const documentId = params.id;
    const confirmedData = parsed.data;

    // 1. Mark document as validated with the (possibly user-corrected) data
    const doc = await confirmDocumentExtraction(userId, documentId, confirmedData);

    // 2. Create real-world entities from the confirmed extraction
    await createEntitiesFromExtraction(userId, documentId, confirmedData);

    // 3. Create deadline / commitment records from important dates
    await createCommitmentsFromExtraction(userId, documentId, confirmedData);

    return NextResponse.json({
      document: doc,
      message: "Document confirmed. Entities and commitments created.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Confirmation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
