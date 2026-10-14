import { db } from "@/db";
import { commitments } from "@/db/schema";
import type { ExtractionResult } from "@/ai/extraction";

/**
 * After the user confirms a document, we create Commitment records
 * for every important date found in it.
 *
 * Example: an insurance policy with an expiry date →
 * creates a "deadline" commitment for that date.
 */
export async function createCommitmentsFromExtraction(
  userId: string,
  documentId: string,
  extraction: ExtractionResult
): Promise<void> {
  // Only create commitments for dates marked as important
  const importantDates = extraction.dates.filter((d) => d.isImportant);

  for (const dateEntry of importantDates) {
    const dueDate = new Date(dateEntry.date);

    // Skip invalid dates
    if (isNaN(dueDate.getTime())) continue;

    // Map date type to commitment type
    const commitmentType =
      dateEntry.type === "payment" || dateEntry.type === "renewal"
        ? "recurring"
        : "deadline";

    // Find the primary financial amount if there is one
    const primaryFinancial = extraction.financials[0];

    await db.insert(commitments).values({
      userId,
      documentId,
      type: commitmentType,
      title: `${dateEntry.label} — ${extraction.title}`,
      description: extraction.summary,
      sourceClause: dateEntry.label,
      dueDate,
      amount: primaryFinancial ? String(primaryFinancial.amount) : null,
      currency: primaryFinancial?.currency ?? "INR",
      status: "active",
    });
  }
}
