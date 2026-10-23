/**
 * POST /api/chat
 * Body: { conversationId?: string, message: string }
 *
 * Flow:
 *  1. Get or create a conversation
 *  2. Save the user's message
 *  3. Retrieve relevant document chunks (RAG)
 *  4. Build context: system prompt + recent history + retrieved chunks
 *  5. Call the LLM (with tools enabled)
 *  6. Save the assistant's response
 *  7. Return the full response JSON
 *
 * GET /api/chat
 * Returns the user's conversation list.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createConversation,
  getConversation,
  getRecentMessages,
  addMessage,
  updateConversationTitle,
  touchConversation,
} from "@/modules/conversations/conversation.service";
import { listConversations } from "@/modules/conversations/conversation.service";
import { retrieveChunks } from "@/ai/retrieval";
import { chat, type ChatMessage } from "@/ai/provider";
import { TOOLS } from "@/ai/tools/registry";
import { executeTool } from "@/ai/tools/executor";

const SendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

export const maxDuration = 60; // seconds — Vercel Hobby allows up to 60s

// ─── POST — send a message ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, conversationId: existingId } = parsed.data;

  // 1. Get or create conversation
  let conversation = existingId
    ? await getConversation(userId, existingId)
    : null;

  if (!conversation) {
    conversation = await createConversation(userId);
  }

  const convId = conversation.id;

  // 2. Save the user's message
  await addMessage(convId, "user", message);

  // 3. Retrieve relevant chunks via RAG
  let retrievedChunkIds: string[] = [];
  let ragContext = "";
  try {
    const chunks = await retrieveChunks({ userId, query: message, topK: 3, minSimilarity: 0.45 });
    if (chunks.length > 0) {
      retrievedChunkIds = chunks.map((c) => c.chunkId);
      ragContext =
        "\n\n---DOCUMENT CONTEXT (retrieved from user's documents)---\n" +
        chunks
          .map(
            (c) =>
              `[From: "${c.documentTitle ?? "Untitled"}" | Category: ${c.category ?? "General"}]\n${c.content}`
          )
          .join("\n\n") +
        "\n---END DOCUMENT CONTEXT---\n";
    }
  } catch {
    // RAG failure is non-fatal — chat still works without it
  }

  // 4. Build context
  const recentMessages = await getRecentMessages(convId, 8);
  const today = new Date().toLocaleDateString("en-IN", { dateStyle: "long" });

  const systemPrompt = `You are LifeOps, an intelligent personal life admin assistant.

You help the user manage their personal documents — insurance policies, warranties, contracts,
bills, receipts, and other important life documents.

You can:
- Answer questions about their documents using the search_documents tool
- List their commitments and upcoming deadlines with list_commitments
- Create reminders with create_reminder
- Look up a specific document with get_document

When answering:
- Be specific — cite exact policy numbers, amounts, and dates from documents
- If the context shows relevant document passages, use them in your answer
- If you're uncertain, say so rather than guessing
- Keep answers concise and actionable
- For Indian documents: amounts are in INR (₹) unless stated otherwise

Today's date: ${today}
${ragContext}`;

  // Build message history for the LLM
  const chatMessages: ChatMessage[] = recentMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Ensure the current user message is the last one
  if (chatMessages.at(-1)?.content !== message || chatMessages.at(-1)?.role !== "user") {
    chatMessages.push({ role: "user", content: message });
  }

  // 5. Call LLM with tools
  let aiResponse;
  try {
    aiResponse = await chat({
      messages: chatMessages,
      systemPrompt,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      onToolCall: async (name, args) => {
        return executeTool(name, args, { userId, conversationId: convId });
      },
      maxToolRounds: 3,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: `AI failed: ${message}` }, { status: 500 });
  }

  // 6. Save assistant response
  const savedMsg = await addMessage(convId, "assistant", aiResponse.content, {
    retrievedChunkIds: retrievedChunkIds.length > 0 ? retrievedChunkIds : undefined,
    toolResults: aiResponse.toolCallsMade.length > 0 ? aiResponse.toolCallsMade : undefined,
  });

  // Auto-title the conversation from the first user message
  if (!conversation.title && recentMessages.filter((m) => m.role === "user").length <= 1) {
    const title = message.length > 60 ? message.slice(0, 57) + "…" : message;
    await updateConversationTitle(convId, title);
  } else {
    await touchConversation(convId);
  }

  return NextResponse.json({
    conversationId: convId,
    message: {
      id: savedMsg.id,
      role: "assistant",
      content: aiResponse.content,
      toolCallsMade: aiResponse.toolCallsMade,
      retrievedChunkIds,
      createdAt: savedMsg.createdAt,
    },
  });
}

// ─── GET — list conversations ─────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convs = await listConversations(session.user.id);
  return NextResponse.json({ conversations: convs });
}
