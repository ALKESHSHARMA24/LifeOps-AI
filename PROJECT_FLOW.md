# PROJECT_FLOW.md — LifeOps AI
**Living document. Updated every time a feature is added or changed.**

Last updated: Phase 5 — Intelligence
Status: ✅ Phase 0 | ✅ Phase 1 | ✅ Phase 2 | ✅ Phase 3 | ✅ Phase 4 | ✅ Phase 5

---

## Table of Contents
1. [Product Principle](#1-product-principle)
2. [System Architecture](#2-system-architecture)
3. [Module Map](#3-module-map)
4. [Database Schema Overview](#4-database-schema-overview)
5. [Phase 0 — Foundation (current)](#5-phase-0--foundation)
6. [Phase 1 — Knowledge (next)](#6-phase-1--knowledge-next)
7. [Phase 2 — Retrieval](#7-phase-2--retrieval)
8. [Phase 3 — Conversation](#8-phase-3--conversation)
9. [Phase 4 — Actions](#9-phase-4--actions)
10. [Phase 5 — Intelligence](#10-phase-5--intelligence)
11. [AI Integration Points](#11-ai-integration-points)
12. [Deferred / Future Features](#12-deferred--future-features)

---

## 1. Product Principle

> Don't make the user organize their life for the software.  
> Make the software understand the user's life.

**Core loop:**  
`Capture → Understand → Organize → Retrieve → Reason → Recommend → Act → Learn`

**Key rule:**  
AI handles understanding / extraction / reasoning.  
Application handles auth / CRUD / date math / business rules.  
The LLM is never a security boundary.

---

## 2. System Architecture

```
Browser (Next.js App Router)
  │
  ├── /app/(auth)/*          Login, Register (public)
  ├── /app/(dashboard)/*     Protected pages (server components)
  └── /app/api/*             API Route Handlers (backend logic)
          │
          ├── /api/auth/[...nextauth]   NextAuth handlers
          ├── /api/auth/register        User registration
          ├── /api/documents/*          [Phase 1]
          ├── /api/chat/*               [Phase 3]
          ├── /api/commitments/*        [Phase 1]
          └── /api/tools/*              [Phase 4]
          │
          ├── src/db/          PostgreSQL via Drizzle ORM
          ├── src/modules/     Business logic (framework-independent)
          └── src/ai/          All AI logic (provider adapter pattern)

External:
  PostgreSQL (local)          → Structured data, source of truth
  pgvector extension          → Embeddings for RAG [Phase 2]
  Local filesystem /uploads   → Original document files
  Gemini / OpenAI API         → LLM calls [Phase 1+]
```

---

## 3. Module Map

| Module | Location | Responsibility |
|---|---|---|
| Auth | `src/auth.ts` + `src/app/api/auth/` | Login, register, session (JWT) |
| Documents | `src/modules/documents/` | Upload, process, store docs [Phase 1] |
| Entities | `src/modules/entities/` | Real-world objects (vehicle, home) [Phase 1] |
| Commitments | `src/modules/commitments/` | Deadlines, recurring payments [Phase 1] |
| Conversations | `src/modules/conversations/` | Chat history, context [Phase 3] |
| Actions | `src/modules/actions/` | Tool registry, tool execution [Phase 4] |
| AI | `src/ai/` | Provider adapter, prompts, RAG [Phase 1+] |

---

## 4. Database Schema Overview

All tables live in PostgreSQL. Drizzle ORM is the type-safe query layer.

```
users                    → identity; one record per account
  └── documents          → uploaded files + AI-extracted data
        └── document_chunks → text chunks for RAG [Phase 2]
  └── entities           → real-world objects (vehicle, laptop, home)
        └── document_entities → links documents ↔ entities (many-to-many)
  └── commitments        → deadlines, recurring payments, tasks
        └── reminders    → time-based alerts for a commitment
  └── conversations      → chat sessions
        └── conversation_messages → individual messages (user / assistant / tool)
  └── ai_interactions    → audit: every LLM call
  └── tool_executions    → audit: every tool the AI tried to execute
```

**Key design decisions:**
- `documents.extracted_data` — JSONB, flexible per doc category
- `entities.attributes` — JSONB, flexible per entity type
- `document_chunks.embedding` — `vector(768)` (Gemini) — pgvector cosine similarity
- `commitments.recurrence_rule` — RRULE string (standard iCal format), Phase 2
- All monetary amounts in `decimal(12,2)` with explicit `currency` column
- `household_id` intentionally omitted; added in Phase 3 (Family feature)

**Document lifecycle state machine:**
```
uploaded → processing → extracted → validated → indexed → ready
                                              ↘ error (preserves original file)
```

---

## 5. Phase 0 — Foundation

**Status:** ✅ Complete

### What was built
- Next.js 14 project with TypeScript, Tailwind CSS, shadcn/ui
- Full database schema (Drizzle ORM) covering all phases
- NextAuth v5 with Credentials provider (email + bcrypt password)
- JWT session strategy — no sessions table required
- Register API route (`POST /api/auth/register`)
- Login/Register pages with form validation
- Protected dashboard layout with sidebar navigation
- Dashboard home page (stub — live data added per phase)
- Local file upload folder (`/uploads`)
- Environment variable template (`.env.local.example`)

### Auth flow
```
User fills register form
  → POST /api/auth/register
  → Validate with Zod
  → Check email uniqueness
  → bcrypt hash password (cost 12)
  → INSERT users
  → Redirect to /login

User fills login form
  → NextAuth signIn("credentials")
  → Zod validate
  → SELECT user by email
  → bcrypt.compare password
  → Return user → JWT token created
  → Redirect to /dashboard (or callbackUrl)

All non-public routes
  → middleware.ts intercepts
  → Checks JWT via auth()
  → Redirects to /login if no session
```

### Files created in Phase 0
```
package.json
next.config.ts
tsconfig.json
tailwind.config.ts
postcss.config.mjs
drizzle.config.ts
components.json
.env.local.example
.gitignore
PROJECT_FLOW.md
docs/setup/postgres.md

src/auth.ts
src/middleware.ts
src/db/schema.ts
src/db/index.ts
src/lib/utils.ts
src/lib/validations/auth.ts

src/app/layout.tsx
src/app/globals.css
src/app/(auth)/layout.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/register/page.tsx
src/app/(dashboard)/layout.tsx
src/app/(dashboard)/page.tsx

src/app/api/auth/[...nextauth]/route.ts
src/app/api/auth/register/route.ts

src/components/ui/button.tsx
src/components/ui/input.tsx
src/components/ui/label.tsx
src/components/ui/card.tsx
```

### Exit criteria met
- [x] User can register with name, email, password
- [x] User can log in
- [x] Protected routes redirect to login
- [x] Dashboard renders with session data
- [x] DB schema covers all future phases

---

## 6. Phase 1 — Knowledge

**Status:** ✅ Complete

### Scope
1. Document upload API (`POST /api/documents`)
   - Accept PDF, JPEG, PNG, WebP
   - Store original file at `/uploads/{userId}/{uuid}.{ext}`
   - Create `documents` record with status `uploaded`
2. AI document processing pipeline (synchronous for MVP)
   - Extract text from PDF (pdf-parse) or OCR image (tesseract.js)
   - Send text to LLM with structured output prompt
   - Extract: category, title, key dates, entities, financial info, confidence scores
   - Validate schema with Zod
   - Update document record with extracted data + status `extracted`
3. User confirmation UI
   - Show extracted fields
   - User can correct/confirm
   - On confirm: status → `validated`, create entities + commitments
4. Document list page (`/documents`)
5. Document detail page (`/documents/[id]`)

### AI integration (Phase 1)
```
Input:  document text (PDF/OCR output)
Prompt: "Extract structured information from this document. Return JSON."
Output: { category, title, dates[], entities[], financials, confidence }
Model:  gemini-1.5-flash (fast, free tier) or gpt-4o-mini
```

### Files created (Phase 1)
```
src/lib/storage.ts                              ← local file save/read/delete
src/ai/provider.ts                              ← Gemini / OpenAI adapter
src/ai/prompts/extraction.ts                    ← system + user extraction prompt
src/ai/extraction.ts                            ← Zod schema + extraction pipeline
src/modules/documents/document.types.ts
src/modules/documents/document.service.ts       ← upload, process, confirm
src/modules/entities/entity.service.ts          ← create entities from extraction
src/modules/commitments/commitment.service.ts   ← create commitments from dates
src/app/api/documents/route.ts                  ← POST upload, GET list
src/app/api/documents/[id]/route.ts             ← GET single
src/app/api/documents/[id]/confirm/route.ts     ← POST confirm
src/app/(dashboard)/documents/page.tsx          ← server component
src/app/(dashboard)/documents/documents-client.tsx  ← upload zone + document list
src/app/(dashboard)/documents/[id]/page.tsx     ← server component
src/app/(dashboard)/documents/[id]/extraction-review.tsx ← review + confirm UI
src/components/ui/badge.tsx
src/types/next-auth.d.ts
```

### Phase 1 document upload flow (end to end)
```
User drops file on /documents
  → POST /api/documents (FormData)
  → validateFileType + validateFileSize
  → saveUploadedFile() → /uploads/{userId}/{docId}.pdf
  → INSERT documents (status: "uploaded")
  → UPDATE status → "processing"
  → extractDocumentData()
      PDF  → pdf-parse → text → generateJSON(prompt, text)
      Image → generateJSON(prompt, image)  ← vision model
      → JSON.parse() → ExtractionResultSchema.parse()  ← Zod validation
  → UPDATE documents (status: "extracted", extractedData: {...})
  → Return document to client
  → Client redirects to /documents/{id}

User reviews extraction on /documents/{id}
  → Sees: summary, key facts, dates, financials, entities, suggested actions
  → Clicks "Confirm & Save"
  → POST /api/documents/{id}/confirm
  → ExtractionResultSchema.parse(body)   ← validate again on server
  → confirmDocumentExtraction()          ← status → "validated"
  → createEntitiesFromExtraction()       ← INSERT entities + document_entities
  → createCommitmentsFromExtraction()    ← INSERT commitments for important dates
  → Redirect to /documents
```

---

## 7. Phase 2 — Retrieval

**Status:** ✅ Complete

### Scope
- Chunking service: split extracted text into overlapping chunks ✅
- Embedding service: send chunks to embedding model → store as vectors ✅
- Migrate `document_chunks.embedding` column to `vector(768)` (pgvector) ✅
- Retrieval service: embed query → cosine similarity search → return top-k chunks ✅
- Metadata filtering: filter by userId, category before similarity ✅
- Semantic search page: `/search` ✅

### AI integration (Phase 2)
```
Chunking:   recursive character splitting (~400 tokens, 80 token overlap)
            src/ai/chunking.ts
Embedding:  text-embedding-004 (Gemini, 768-dim) or text-embedding-3-small (OpenAI, 1536-dim)
            src/ai/provider.ts → generateEmbedding()
            src/ai/embedding.ts → embedAndStoreChunks()
Retrieval:  pgvector <=> cosine distance, top 5 chunks (configurable)
            src/ai/retrieval.ts → retrieveChunks()
```

### Phase 2 RAG flow (end to end)
```
User confirms a document
  → confirmDocumentExtraction()
  → chunkText(rawText)             ← recursive char split, ~400 tokens/chunk
  → embedAndStoreChunks()
      → generateEmbedding(chunk)   ← Gemini text-embedding-004 or OpenAI
      → INSERT document_chunks (embedding: vector(768))
  → UPDATE documents (status: "indexed")

User searches at /search
  → POST /api/search { query, topK }
  → retrieveChunks(userId, query)
  → generateEmbedding(query)       ← same model as indexing
  → SELECT ... ORDER BY embedding <=> query_vector LIMIT topK
  → Return results with similarity score + source document link
```

### Files created (Phase 2)
```
src/ai/chunking.ts                 ← recursive character text splitter
src/ai/embedding.ts                ← chunk → embed → insert document_chunks
src/ai/retrieval.ts                ← pgvector cosine similarity search
src/app/api/search/route.ts        ← POST /api/search
src/app/(dashboard)/search/page.tsx
src/app/(dashboard)/search/search-client.tsx
src/db/migrations/0001_supreme_deathstrike.sql  ← vector(768) + raw_text columns
```

### Key decisions
- EMBEDDING_DIM = 768 (Gemini) hardcoded in schema — if switching to OpenAI (1536-dim), a new migration is needed
- `rawText` is stored during upload/extraction so confirm-time chunking doesn't need to re-read the file
- Chunking happens synchronously on confirm (not background job — deferred to Phase 4/BullMQ)
- `minSimilarity = 0.5` default filter — weak matches are dropped before returning to UI
- Documents only reach `indexed` status if they have raw text AND chunks were embedded successfully

---

## 8. Phase 3 — Conversation

**Status:** ✅ Complete

### Scope
- Chat page (`/chat`) with conversation history sidebar ✅
- Conversation + message persistence in DB ✅
- RAG context injection: top-3 relevant chunks injected into system prompt ✅
- Multi-turn history: last 8 messages sent to LLM for context ✅
- Auto-title conversations from first message ✅

### Files created (Phase 3)
```
src/modules/conversations/conversation.service.ts  ← CRUD for conversations + messages
src/app/api/chat/route.ts                          ← POST (send msg), GET (list convs)
src/app/api/chat/[id]/route.ts                     ← GET single conversation with messages
src/app/(dashboard)/chat/page.tsx
src/app/(dashboard)/chat/chat-client.tsx           ← chat UI with sidebar + thinking state
```

### Chat flow (end to end)
```
User types message at /chat
  → POST /api/chat { message, conversationId? }
  → Get/create conversation
  → INSERT conversation_messages (role: user)
  → retrieveChunks(userId, message)          ← top-3 similar document passages
  → Build systemPrompt with:
      - LifeOps identity + instructions
      - Today's date
      - Retrieved document passages (if any)
  → chat({ messages, systemPrompt, tools, onToolCall })
      → Handles tool calls (Phase 4)
      → Returns final text response
  → INSERT conversation_messages (role: assistant)
  → Return { conversationId, message }
```

---

## 9. Phase 4 — Actions

**Status:** ✅ Complete

### Tools implemented
| Tool | Description | Risk |
|---|---|---|
| `search_documents` | Semantic search over user's documents | low |
| `list_commitments` | List active commitments by type/status | low |
| `get_document` | Get full details of a specific document | low |
| `create_reminder` | Create a timed reminder (AI-initiated) | medium |

### Files created (Phase 4)
```
src/ai/tools/registry.ts   ← tool definitions with JSON Schema + risk levels
src/ai/tools/executor.ts   ← runs tools, logs to tool_executions table
```

### Tool call flow
```
LLM returns a tool call (name + args)
  → onToolCall(name, args) in chat API route
  → executeTool(name, args, { userId, conversationId })
      → Runs the matching implementation
      → INSERT tool_executions (audit log)
      → Returns plain text result string
  → Result sent back to LLM as tool response
  → LLM generates final answer using tool result
  → Repeated up to 3 rounds (maxToolRounds)
```

### AI provider tool calling
- **Gemini**: uses `functionDeclarations` + `functionCalls()` response
- **OpenAI**: uses `tools` array + `tool_calls` in response, `role: "tool"` messages

---

## 10. Phase 5 — Intelligence

**Status:** ✅ Complete

### Scope
- Smart Timeline page (`/timeline`): all commitments sorted by urgency ✅
- Attention feed on dashboard: overdue, urgent, and unconfirmed items ✅
- Live stats: total docs, active commitments, upcoming deadlines, pending reviews ✅

### Files created (Phase 5)
```
src/modules/intelligence/attention.service.ts  ← attention items, timeline, stats
src/app/(dashboard)/timeline/page.tsx          ← commitments sorted by urgency
src/app/(dashboard)/page.tsx                   ← updated with live data + attention feed
```

### Urgency levels
```
overdue  → past due date (red)
urgent   → due within 7 days (orange)
soon     → due within 14 days, or unconfirmed doc (yellow)
upcoming → due within 30 days (blue)
```

---

## 11. AI Integration Points

| Phase | Feature | Input | Output | Model |
|---|---|---|---|---|
| 1 | Document extraction | Document text | Structured JSON | Gemini Flash / GPT-4o Mini |
| 2 | Embedding | Text chunk | Float vector | text-embedding-004 |
| 3 | RAG answer | Question + chunks | Grounded answer | Gemini Pro / GPT-4o |
| 4 | Tool selection | Conversation + tools | Tool call | Gemini Pro / GPT-4o |
| 5 | Attention summary | Commitments data | Prioritized list | Gemini Flash |

**Provider adapter pattern (`src/ai/provider.ts`):**
```typescript
// Switch provider via env var: AI_PROVIDER=gemini | openai
// All AI features call provider.complete(), provider.embed()
// Never call Gemini/OpenAI SDK directly from feature code
```

---

## 12. Deferred / Future Features

| Feature | Target Phase | Notes |
|---|---|---|
| BullMQ + Redis workers | Phase 4 | For async document processing at scale |
| AWS S3 storage | Deployment | Free tier; guide in docs/setup/storage.md |
| Recurring commitments (RRULE) | Phase 2 | Column already in schema |
| Conversation memory (persistent) | Phase 3 | `memory` field on conversations |
| Agent orchestration | Phase 6 | Multi-step workflows |
| Family / household accounts | Phase 3+ | `household_id` not yet in schema |
| Email ingestion | Phase 2 | Gmail API integration |
| Reranking (RAG improvement) | Phase 4 | Cross-encoder reranking |
| Hybrid retrieval | Phase 4 | BM25 + vector |
| AI observability | Phase 7 | Langfuse (open-source, free self-host) |
| Mobile app | Post-MVP | Web is mobile-responsive |
