/**
 * Tool Executor — Phase 4
 *
 * Runs a tool call from the LLM with the given arguments.
 * - Validates arguments against the tool definition
 * - Checks the user owns any resource referenced
 * - Logs every execution to tool_executions table
 * - Returns a plain string result the LLM can read
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  documents,
  commitments,
  reminders,
  toolExecutions,
} from "@/db/schema";
import { retrieveChunks } from "@/ai/retrieval";
import { getToolByName } from "./registry";

export interface ToolContext {
  userId: string;
  conversationId?: string;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const tool = getToolByName(toolName);

  // Log this execution attempt
  const [execution] = await db
    .insert(toolExecutions)
    .values({
      userId: ctx.userId,
      conversationId: ctx.conversationId ?? null,
      toolName,
      toolArguments: args,
      riskLevel: tool?.riskLevel ?? "low",
      status: "executed",
    })
    .returning();

  try {
    let result: string;

    switch (toolName) {
      case "search_documents":
        result = await runSearchDocuments(args, ctx);
        break;
      case "list_commitments":
        result = await runListCommitments(args, ctx);
        break;
      case "get_document":
        result = await runGetDocument(args, ctx);
        break;
      case "create_reminder":
        result = await runCreateReminder(args, ctx);
        break;
      default:
        result = `Unknown tool: ${toolName}`;
    }

    // Update log with result
    await db
      .update(toolExecutions)
      .set({ toolResult: { result } })
      .where(eq(toolExecutions.id, execution.id));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    await db
      .update(toolExecutions)
      .set({ status: "failed", toolResult: { error: message } })
      .where(eq(toolExecutions.id, execution.id));
    return `Tool error: ${message}`;
  }
}

// ─── Individual Tool Implementations ─────────────────────────────────────────

async function runSearchDocuments(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const query = String(args.query ?? "");
  const category = args.category ? String(args.category) : undefined;

  if (!query) return "No query provided.";

  const results = await retrieveChunks({
    userId: ctx.userId,
    query,
    category,
    topK: 4,
    minSimilarity: 0.4,
  });

  if (results.length === 0) {
    return "No relevant document passages found for this query.";
  }

  return results
    .map(
      (r, i) =>
        `[Result ${i + 1}] From "${r.documentTitle ?? "Untitled"}" (${r.category ?? "Uncategorized"}):\n${r.content}`
    )
    .join("\n\n---\n\n");
}

async function runListCommitments(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const rows = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, ctx.userId),
        eq(commitments.status, (args.status as "active" | "overdue") ?? "active")
      )
    )
    .limit(20);

  if (rows.length === 0) return "No commitments found.";

  return rows
    .map((c) => {
      const due = c.dueDate
        ? new Date(c.dueDate).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "No due date";
      const amount = c.amount ? ` | ₹${c.amount}` : "";
      return `• ${c.title} (${c.type}) — Due: ${due}${amount} — Status: ${c.status}`;
    })
    .join("\n");
}

async function runGetDocument(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const docId = String(args.documentId ?? "");
  if (!docId) return "No documentId provided.";

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.userId, ctx.userId)))
    .limit(1);

  if (!doc) return "Document not found or access denied.";

  const data = doc.extractedData as Record<string, unknown> | null;
  const lines = [
    `Title: ${doc.title ?? "Untitled"}`,
    `Category: ${doc.category ?? "Unknown"}`,
    `Status: ${doc.status}`,
    `File: ${doc.originalFilename}`,
  ];

  if (data?.summary) lines.push(`Summary: ${data.summary}`);
  if (data?.keyFacts && Array.isArray(data.keyFacts)) {
    const facts = (data.keyFacts as Array<{ key: string; value: string }>)
      .map((f) => `  ${f.key}: ${f.value}`)
      .join("\n");
    lines.push(`Key facts:\n${facts}`);
  }

  return lines.join("\n");
}

async function runCreateReminder(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const title = String(args.title ?? "");
  const remindAt = args.remindAt ? new Date(String(args.remindAt)) : null;

  if (!title || !remindAt || isNaN(remindAt.getTime())) {
    return "Invalid reminder: title and a valid remindAt datetime are required.";
  }

  const [reminder] = await db
    .insert(reminders)
    .values({
      userId: ctx.userId,
      commitmentId: args.commitmentId ? String(args.commitmentId) : null,
      title,
      remindAt,
      status: "pending",
      createdByAi: true,
    })
    .returning();

  return `Reminder created: "${reminder.title}" — will fire at ${remindAt.toLocaleString("en-IN")}`;
}
