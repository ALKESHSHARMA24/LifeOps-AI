import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  uploadAndProcessDocument,
  listDocuments,
} from "@/modules/documents/document.service";

export const maxDuration = 60; // seconds — Vercel Hobby allows up to 60s


// POST /api/documents — Upload and process a document
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const document = await uploadAndProcessDocument(session.user.id, file);

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// GET /api/documents — List all documents for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await listDocuments(session.user.id);
  return NextResponse.json({ documents: docs });
}
