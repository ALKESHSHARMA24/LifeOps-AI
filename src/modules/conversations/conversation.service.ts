import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { conversations, conversationMessages } from "@/db/schema";

// ─── Conversations ────────────────────────────────────────────────────────────

export async function createConversation(userId: string, title?: string) {
  const [conv] = await db
    .insert(conversations)
    .values({ userId, title: title ?? null })
    .returning();
  return conv;
}

export async function getConversation(userId: string, conversationId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return conv ?? null;
}

export async function listConversations(userId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(30);
}

export async function updateConversationTitle(conversationId: string, title: string) {
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function touchConversation(conversationId: string) {
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  extras?: {
    toolCalls?: unknown;
    toolResults?: unknown;
    retrievedChunkIds?: string[];
    tokenCount?: number;
  }
) {
  const [msg] = await db
    .insert(conversationMessages)
    .values({
      conversationId,
      role,
      content,
      toolCalls: extras?.toolCalls ?? null,
      toolResults: extras?.toolResults ?? null,
      retrievedChunkIds: extras?.retrievedChunkIds ?? null,
      tokenCount: extras?.tokenCount ?? null,
    })
    .returning();
  return msg;
}

export async function getRecentMessages(conversationId: string, limit = 10) {
  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(limit);

  // Return in chronological order (oldest first)
  return rows.reverse();
}

export async function getAllMessages(conversationId: string) {
  return db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt));
}
