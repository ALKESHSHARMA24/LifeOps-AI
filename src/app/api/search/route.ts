import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { retrieveChunks } from "@/ai/retrieval";

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  category: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { query, category, topK } = parsed.data;

  try {
    const results = await retrieveChunks({
      userId: session.user.id,
      query,
      category,
      topK,
    });

    return NextResponse.json({ results, query });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
