/**
 * Tool Registry — Phase 4
 *
 * Each tool has:
 *   - jsonSchema: what the LLM sees (used when calling Gemini/OpenAI)
 *   - riskLevel: low = auto-execute, medium = warn in UI, high = require user approval
 *
 * Tools are pure definitions here. Execution logic is in executor.ts.
 */

export interface ToolParameterSchema {
  type: string;
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  riskLevel: "low" | "medium" | "high";
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "search_documents",
    description:
      "Semantically search the user's personal documents to find relevant passages. " +
      "Use this when the user asks about a specific topic, policy, amount, date, or entity " +
      "that might be in one of their uploaded documents.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query — a natural language description of what to find.",
        },
        category: {
          type: "string",
          description:
            "Optional document category to filter by (e.g. Insurance, Warranty, Contract, Receipt).",
        },
      },
      required: ["query"],
    },
    riskLevel: "low",
  },
  {
    name: "list_commitments",
    description:
      "List the user's active commitments — deadlines, recurring payments, and tasks. " +
      "Use this when the user asks about upcoming payments, renewals, or what they owe.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by commitment type.",
          enum: ["deadline", "recurring", "conditional", "task"],
        },
        status: {
          type: "string",
          description: "Filter by status. Default is 'active'.",
          enum: ["active", "completed", "overdue"],
        },
      },
      required: [],
    },
    riskLevel: "low",
  },
  {
    name: "get_document",
    description:
      "Get full details of a specific document by its ID, including all extracted data.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The UUID of the document to retrieve.",
        },
      },
      required: ["documentId"],
    },
    riskLevel: "low",
  },
  {
    name: "create_reminder",
    description:
      "Create a reminder that will alert the user at a specific date and time. " +
      "Use this when the user says something like 'remind me about X' or 'set a reminder for Y'.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for the reminder (e.g. 'Car insurance renewal').",
        },
        remindAt: {
          type: "string",
          description: "ISO 8601 datetime when to remind (e.g. '2025-03-15T09:00:00').",
        },
        commitmentId: {
          type: "string",
          description: "Optional: UUID of the related commitment, if this reminder is for one.",
        },
      },
      required: ["title", "remindAt"],
    },
    riskLevel: "medium",
  },
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

// Convert our tool format to Gemini's functionDeclarations format
export function toGeminiFunctions() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

// Convert our tool format to OpenAI's tools format
export function toOpenAITools() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
