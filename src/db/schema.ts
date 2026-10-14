import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
  pgEnum,
  decimal,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// pgvector custom column type
// OpenAI text-embedding-3-small outputs 1536 dimensions
// Gemini text-embedding-004 outputs 768 dimensions
// Current config: OpenAI (EMBEDDING_PROVIDER=openai in .env.local)
const EMBEDDING_DIM = 1536;

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace("[", "")
      .replace("]", "")
      .split(",")
      .map(Number);
  },
});

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",      // file saved, not yet processed
  "processing",    // AI pipeline running
  "extracted",     // AI extraction done, pending user confirmation
  "validated",     // user confirmed the extracted data
  "indexed",       // chunked + embedded, ready for RAG
  "error",         // processing failed
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "vehicle",
  "home",
  "device",        // laptop, phone, appliance
  "person",        // family member, tenant
  "subscription",
  "other",
]);

export const commitmentTypeEnum = pgEnum("commitment_type", [
  "deadline",      // one-time expiry (insurance, passport)
  "recurring",     // repeating payment (rent, EMI, subscription)
  "conditional",   // derived from a clause (notice period)
  "task",          // manual to-do
]);

export const commitmentStatusEnum = pgEnum("commitment_status", [
  "active",
  "completed",
  "dismissed",
  "overdue",
]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "pending",
  "sent",
  "dismissed",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
  "tool",
]);

export const toolExecutionStatusEnum = pgEnum("tool_execution_status", [
  "pending_approval",
  "approved",
  "rejected",
  "executed",
  "failed",
]);

// ─────────────────────────────────────────────
// IDENTITY DOMAIN
// ─────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // household_id will be added in Phase 3 (Family feature)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// KNOWLEDGE DOMAIN — Documents
// ─────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // File info
    title: text("title"),                      // AI-generated or user-provided
    originalFilename: text("original_filename").notNull(),
    filePath: text("file_path").notNull(),      // local: /uploads/userId/filename
    fileType: text("file_type").notNull(),      // pdf, image/jpeg, etc.
    fileSizeBytes: integer("file_size_bytes"),

    // AI-extracted structured data (stored as JSONB — flexible per doc type)
    extractedData: jsonb("extracted_data"),

    // Classification
    category: text("category"),                // Insurance, Warranty, Contract, Receipt...
    subcategory: text("subcategory"),

    // Raw extracted text (PDF → pdfParse output, stored for chunking in Phase 2)
    rawText: text("raw_text"),

    // Processing
    status: documentStatusEnum("status").notNull().default("uploaded"),
    processingError: text("processing_error"),
    aiModel: text("ai_model"),                 // which model processed this doc

    // Confidence tracking (BRD section 33)
    confidenceScore: decimal("confidence_score", { precision: 4, scale: 3 }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("documents_user_id_idx").on(table.userId),
    statusIdx: index("documents_status_idx").on(table.status),
    categoryIdx: index("documents_category_idx").on(table.category),
  })
);

// Chunks + embeddings for RAG (Phase 2)
// embedding column is text now; Phase 2 will migrate to vector(1536)
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    content: text("content").notNull(),        // the actual text chunk
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count"),

    // Metadata for retrieval filtering
    metadata: jsonb("metadata"),               // { page, section, category, dates... }

    // Vector embedding — 768 dimensions (Gemini text-embedding-004)
    embedding: vector("embedding"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    documentIdIdx: index("chunks_document_id_idx").on(table.documentId),
    userIdIdx: index("chunks_user_id_idx").on(table.userId),
  })
);

// ─────────────────────────────────────────────
// ENTITY DOMAIN — Real-world objects
// ─────────────────────────────────────────────

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: entityTypeEnum("type").notNull(),
    name: text("name").notNull(),              // "Honda City", "MacBook Pro", "2BHK Apt"

    // Flexible attributes per entity type stored as JSONB
    // Vehicle: { make, model, year, registrationNumber, color }
    // Device:  { brand, model, serialNumber, purchaseDate }
    // Home:    { address, type, ownershipType }
    attributes: jsonb("attributes"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("entities_user_id_idx").on(table.userId),
    typeIdx: index("entities_type_idx").on(table.type),
  })
);

// Links documents to entities (many-to-many)
export const documentEntities = pgTable("document_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type"), // "insures", "warrants", "covers"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// COMMITMENTS DOMAIN — Deadlines & Recurring
// ─────────────────────────────────────────────

export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Source references
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),

    type: commitmentTypeEnum("type").notNull(),
    title: text("title").notNull(),            // "Car Insurance Renewal"
    description: text("description"),
    sourceClause: text("source_clause"),       // raw text from document that created this

    // Timing
    dueDate: timestamp("due_date"),
    actionDate: timestamp("action_date"),      // e.g. 60 days before due (notice period)
    recurrenceRule: text("recurrence_rule"),   // RRULE string for recurring (Phase 2)
    nextOccurrence: timestamp("next_occurrence"),

    // Financial
    amount: decimal("amount", { precision: 12, scale: 2 }),
    currency: text("currency").default("INR"),

    status: commitmentStatusEnum("status").notNull().default("active"),

    // AI-generated priority (1-10)
    priorityScore: integer("priority_score"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("commitments_user_id_idx").on(table.userId),
    dueDateIdx: index("commitments_due_date_idx").on(table.dueDate),
    statusIdx: index("commitments_status_idx").on(table.status),
  })
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    commitmentId: uuid("commitment_id").references(() => commitments.id, {
      onDelete: "cascade",
    }),

    title: text("title").notNull(),
    remindAt: timestamp("remind_at").notNull(),
    status: reminderStatusEnum("status").notNull().default("pending"),

    // Tracks if this was created by AI tool call or by user
    createdByAi: boolean("created_by_ai").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("reminders_user_id_idx").on(table.userId),
    remindAtIdx: index("reminders_remind_at_idx").on(table.remindAt),
  })
);

// ─────────────────────────────────────────────
// CONVERSATION DOMAIN — Chat
// ─────────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),                      // auto-generated from first message
    summary: text("summary"),                  // rolling summary for context compression
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("conversations_user_id_idx").on(table.userId),
  })
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),

    // For tool call messages (Phase 4)
    toolCalls: jsonb("tool_calls"),
    toolResults: jsonb("tool_results"),

    // Which document chunks were retrieved for this response (Phase 2)
    retrievedChunkIds: jsonb("retrieved_chunk_ids"),

    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(
      table.conversationId
    ),
  })
);

// ─────────────────────────────────────────────
// AUDIT DOMAIN — Traceability
// ─────────────────────────────────────────────

export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // What triggered this AI call
    interactionType: text("interaction_type").notNull(), // "document_extraction", "rag_query", "tool_call"
    relatedDocumentId: uuid("related_document_id"),
    relatedConversationId: uuid("related_conversation_id"),

    // Model details
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),

    // Result summary (not storing full prompts for privacy)
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),

    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("ai_interactions_user_id_idx").on(table.userId),
    typeIdx: index("ai_interactions_type_idx").on(table.interactionType),
  })
);

export const toolExecutions = pgTable(
  "tool_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" }
    ),

    toolName: text("tool_name").notNull(),     // "create_reminder", "search_documents"
    toolArguments: jsonb("tool_arguments"),     // what the LLM passed in
    toolResult: jsonb("tool_result"),           // what the backend returned

    // Risk level drives approval flow (BRD section 23)
    riskLevel: text("risk_level").notNull().default("low"), // low | medium | high
    status: toolExecutionStatusEnum("status").notNull().default("executed"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("tool_executions_user_id_idx").on(table.userId),
  })
);

// ─────────────────────────────────────────────
// RELATIONS (for Drizzle query builder)
// ─────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  entities: many(entities),
  commitments: many(commitments),
  reminders: many(reminders),
  conversations: many(conversations),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  chunks: many(documentChunks),
  documentEntities: many(documentEntities),
  commitments: many(commitments),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  user: one(users, { fields: [entities.userId], references: [users.id] }),
  documentEntities: many(documentEntities),
  commitments: many(commitments),
}));

export const commitmentsRelations = relations(commitments, ({ one, many }) => ({
  user: one(users, { fields: [commitments.userId], references: [users.id] }),
  document: one(documents, {
    fields: [commitments.documentId],
    references: [documents.id],
  }),
  entity: one(entities, {
    fields: [commitments.entityId],
    references: [entities.id],
  }),
  reminders: many(reminders),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    messages: many(conversationMessages),
  })
);
