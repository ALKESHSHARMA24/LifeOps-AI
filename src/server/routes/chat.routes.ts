import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  createConversation,
  getConversation,
  getRecentMessages,
  addMessage,
  updateConversationTitle,
  touchConversation,
  listConversations,
  getAllMessages,
} from "../../modules/conversations/conversation.service";
import { retrieveChunks } from "../../ai/retrieval";
import { chat, type ChatMessage } from "../../ai/provider";
import { TOOLS } from "../../ai/tools/registry";
import { executeTool } from "../../ai/tools/executor";
import { requireAuth } from "../middleware/auth";

const router = Router();

const SendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

// POST /api/chat — send a message
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = SendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { message, conversationId: existingId } = parsed.data;
  const userId = req.user!.id;

  let conversation = existingId ? await getConversation(userId, existingId) : null;
  if (!conversation) conversation = await createConversation(userId);

  const convId = conversation.id;
  await addMessage(convId, "user", message);

  // RAG retrieval
  let retrievedChunkIds: string[] = [];
  let ragContext = "";
  try {
    const chunks = await retrieveChunks({ userId, query: message, topK: 3, minSimilarity: 0.45 });
    if (chunks.length > 0) {
      retrievedChunkIds = chunks.map((c) => c.chunkId);
      ragContext =
        "\n\n---DOCUMENT CONTEXT (retrieved from user's documents)---\n" +
        chunks.map((c) => `[From: "${c.documentTitle ?? "Untitled"}" | Category: ${c.category ?? "General"}]\n${c.content}`).join("\n\n") +
        "\n---END DOCUMENT CONTEXT---\n";
    }
  } catch {
    // Non-fatal — chat still works without RAG
  }

  const recentMessages = await getRecentMessages(convId, 8);
  const today = new Date().toLocaleDateString("en-IN", { dateStyle: "long" });

  const systemPrompt = `You are LifeOps, an intelligent personal life admin assistant.
You help the user manage their personal documents — insurance policies, warranties, contracts, bills, receipts, and other important life documents.
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

  const chatMessages: ChatMessage[] = recentMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  if (chatMessages.at(-1)?.content !== message || chatMessages.at(-1)?.role !== "user") {
    chatMessages.push({ role: "user", content: message });
  }

  let aiResponse;
  try {
    aiResponse = await chat({
      messages: chatMessages,
      systemPrompt,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      onToolCall: async (name, args) => executeTool(name, args, { userId, conversationId: convId }),
      maxToolRounds: 3,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    res.status(500).json({ error: `AI failed: ${msg}` });
    return;
  }

  const savedMsg = await addMessage(convId, "assistant", aiResponse.content, {
    retrievedChunkIds: retrievedChunkIds.length > 0 ? retrievedChunkIds : undefined,
    toolResults: aiResponse.toolCallsMade.length > 0 ? aiResponse.toolCallsMade : undefined,
  });

  if (!conversation.title && recentMessages.filter((m) => m.role === "user").length <= 1) {
    const title = message.length > 60 ? message.slice(0, 57) + "…" : message;
    await updateConversationTitle(convId, title);
  } else {
    await touchConversation(convId);
  }

  res.json({
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
});

// GET /api/chat — list conversations
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const convs = await listConversations(req.user!.id);
  res.json({ conversations: convs });
});

// GET /api/chat/:id — get conversation with messages
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const conversation = await getConversation(req.user!.id, req.params.id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await getAllMessages(req.params.id);
  res.json({ conversation, messages });
});

export default router;
