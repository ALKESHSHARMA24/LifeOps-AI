/**
 * AI Provider Adapter
 *
 * This is the ONLY place in the codebase that touches Gemini or OpenAI directly.
 * All other modules call functions from this file — never the SDKs directly.
 *
 * To switch providers: set AI_PROVIDER=gemini or AI_PROVIDER=openai in .env.local
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import OpenAI from "openai";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupportedProvider = "gemini" | "openai";

interface GenerateOptions {
  text?: string;
  image?: { buffer: Buffer; mimeType: string };
  systemPrompt?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  systemPrompt: string;
  // Tool definitions (JSON Schema format for the LLM)
  tools?: Array<{ name: string; description: string; parameters: object }>;
  // Called when the LLM wants to invoke a tool. Returns the tool result string.
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxToolRounds?: number; // safety limit on tool call iterations (default 3)
}

export interface ChatResponse {
  content: string;
  toolCallsMade: Array<{ name: string; args: Record<string, unknown>; result: string }>;
}

// Embedding dimensions: OpenAI text-embedding-3-small → 1536, Gemini text-embedding-004 → 768
// Current config: OpenAI (EMBEDDING_PROVIDER=openai, DB column is vector(1536))
export const EMBEDDING_DIM = {
  gemini: 768,
  openai: 1536,
} as const;

// ─── Provider Detection ───────────────────────────────────────────────────────

export function getActiveProvider(): SupportedProvider {
  const provider = process.env.AI_PROVIDER as SupportedProvider;
  if (provider === "openai") return "openai";
  return "gemini"; // default
}

export function isProviderConfigured(): boolean {
  const p = getActiveProvider();
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Send a prompt to the configured AI provider and get a text response back.
 * The response is expected to be a JSON string — callers validate with Zod.
 */
/**
 * Multi-turn chat with optional tool calling.
 *
 * Flow:
 *   1. Send messages + tools to the LLM
 *   2. If the LLM calls a tool → execute it via onToolCall() → send result back → repeat
 *   3. Once the LLM produces a plain text response → return it
 *
 * Max tool rounds prevents infinite loops (default 3).
 */
export async function chat(opts: ChatOptions): Promise<ChatResponse> {
  const provider = getActiveProvider();
  if (provider === "openai") return chatWithOpenAI(opts);
  return chatWithGemini(opts);
}

// ─── Gemini Chat ──────────────────────────────────────────────────────────────

async function chatWithGemini(opts: ChatOptions): Promise<ChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");

  const genAI = new GoogleGenerativeAI(apiKey);

  const modelConfig: Parameters<typeof genAI.getGenerativeModel>[0] = {
    model: "gemini-2.0-flash",
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
  };

  // Attach tool declarations if provided
  if (opts.tools && opts.tools.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modelConfig as any).tools = [{ functionDeclarations: opts.tools }];
  }

  const model = genAI.getGenerativeModel(modelConfig);

  // Convert our ChatMessage[] to Gemini history format
  // Gemini alternates user/model roles; system goes into systemInstruction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any[] = opts.messages
    .filter((m) => m.role !== "system")
    .slice(0, -1) // all but the last (last goes as the new message)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const lastUserMessage = opts.messages.filter((m) => m.role !== "system").at(-1);
  if (!lastUserMessage) throw new Error("No user message provided");

  const chatSession = model.startChat({
    history,
    systemInstruction: opts.systemPrompt,
  });

  const toolCallsMade: ChatResponse["toolCallsMade"] = [];
  const maxRounds = opts.maxToolRounds ?? 3;

  let currentMessage = lastUserMessage.content;

  for (let round = 0; round < maxRounds; round++) {
    const result = await chatSession.sendMessage(currentMessage);
    const response = result.response;

    // Check for function calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (response as any).functionCalls?.() as Array<{ name: string; args: Record<string, unknown> }> | undefined;

    if (!calls || calls.length === 0) {
      // Plain text response — we're done
      return { content: response.text(), toolCallsMade };
    }

    if (!opts.onToolCall) {
      return { content: response.text() || "", toolCallsMade };
    }

    // Execute each tool call
    const toolResponses: { functionResponse: { name: string; response: { result: string } } }[] = [];
    for (const call of calls) {
      const toolResult = await opts.onToolCall(call.name, call.args);
      toolCallsMade.push({ name: call.name, args: call.args, result: toolResult });
      toolResponses.push({
        functionResponse: { name: call.name, response: { result: toolResult } },
      });
    }

    // Send tool results back — the loop will call sendMessage again
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResultMsg = await chatSession.sendMessage(toolResponses as any);
    const toolResultResponse = toolResultMsg.response;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moreCalls = (toolResultResponse as any).functionCalls?.();
    if (!moreCalls || moreCalls.length === 0) {
      return { content: toolResultResponse.text(), toolCallsMade };
    }

    // More tool calls — continue loop with a placeholder (Gemini already has the context)
    currentMessage = "";
  }

  // Exhausted rounds — return whatever we have
  return { content: "I've reached my tool call limit. Please try a more specific question.", toolCallsMade };
}

// ─── OpenAI Chat ──────────────────────────────────────────────────────────────

async function chatWithOpenAI(opts: ChatOptions): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.local");

  const openai = new OpenAI({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openAITools: any[] | undefined = opts.tools?.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const toolCallsMade: ChatResponse["toolCallsMade"] = [];
  const maxRounds = opts.maxToolRounds ?? 3;

  for (let round = 0; round < maxRounds; round++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: openAITools && openAITools.length > 0 ? openAITools : undefined,
      tool_choice: openAITools && openAITools.length > 0 ? "auto" : undefined,
      max_tokens: 1500,
    });

    const choice = completion.choices[0];
    const assistantMessage = choice.message;

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return { content: assistantMessage.content ?? "", toolCallsMade };
    }

    if (!opts.onToolCall) {
      return { content: assistantMessage.content ?? "", toolCallsMade };
    }

    // Add the assistant's tool call message
    messages.push(assistantMessage);

    // Execute each tool call and add results
    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }

      const toolResult = await opts.onToolCall(fnName, fnArgs);
      toolCallsMade.push({ name: fnName, args: fnArgs, result: toolResult });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }

    // Loop: send messages again with tool results included
  }

  return { content: "I've reached my tool call limit. Please try a more specific question.", toolCallsMade };
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

/**
 * Generate a vector embedding for a single piece of text.
 *
 * The database column is vector(1536) — sized for OpenAI text-embedding-3-small.
 * Override with EMBEDDING_PROVIDER=gemini|openai in .env.local.
 * If switching to Gemini (768-dim), run a migration to change the column to vector(768).
 */
export function getEmbeddingProvider(): SupportedProvider {
  const explicit = process.env.EMBEDDING_PROVIDER as SupportedProvider | undefined;
  if (explicit === "gemini") return "gemini";
  // Default to OpenAI — DB schema is vector(1536)
  return "openai";
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  if (provider === "openai") return embedWithOpenAI(text);
  return embedWithGemini(text);
}

export async function generateJSON(
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const provider = getActiveProvider();

  if (provider === "openai") {
    return generateWithOpenAI(userPrompt, options);
  }
  return generateWithGemini(userPrompt, options);
}

// ─── Gemini Implementation ────────────────────────────────────────────────────

async function generateWithGemini(
  userPrompt: string,
  options: GenerateOptions
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    // Tell it to respond only with JSON
    generationConfig: { responseMimeType: "application/json" },
    // Relax safety filters so insurance/medical docs don't get blocked
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ],
  });

  // Build the content parts array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];

  if (options.systemPrompt) {
    parts.push({ text: options.systemPrompt + "\n\n" });
  }

  if (options.image) {
    parts.push({
      inlineData: {
        data: options.image.buffer.toString("base64"),
        mimeType: options.image.mimeType,
      },
    });
  }

  if (options.text) {
    parts.push({ text: options.text });
  }

  parts.push({ text: "\n\n" + userPrompt });

  const result = await model.generateContent(parts);
  const response = result.response;
  return response.text();
}

// ─── OpenAI Implementation ────────────────────────────────────────────────────

async function generateWithOpenAI(
  userPrompt: string,
  options: GenerateOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.local");

  const openai = new OpenAI({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  // Build user message content (text + optional image)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = [];

  if (options.text) {
    userContent.push({ type: "text", text: options.text });
  }

  if (options.image) {
    const base64 = options.image.buffer.toString("base64");
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${options.image.mimeType};base64,${base64}` },
    });
  }

  userContent.push({ type: "text", text: userPrompt });
  messages.push({ role: "user", content: userContent });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", // cheap + supports vision
    messages,
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  return completion.choices[0].message.content ?? "{}";
}

// ─── Embedding Implementations ────────────────────────────────────────────────

async function embedWithGemini(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");

  const genAI = new GoogleGenerativeAI(apiKey);
  // text-embedding-004: free tier, 768 dimensions
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.local");

  const openai = new OpenAI({ apiKey });
  // text-embedding-3-small: cheap, 1536 dimensions
  const result = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return result.data[0].embedding;
}
