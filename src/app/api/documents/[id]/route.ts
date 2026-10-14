import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDocument } from "@/modules/documents/document.service";

// GET /api/documents/[id] — Get a single document with its extraction data
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const doc = await getDocument(session.user.id, params.id);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ document: doc });
}
