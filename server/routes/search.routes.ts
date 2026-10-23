import { Router, Request, Response } from "express";
import { z } from "zod";
import { retrieveChunks } from "../../src/ai/retrieval";
import { requireAuth } from "../middleware/auth";

const router = Router();

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  category: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

// POST /api/search
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = SearchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { query, category, topK } = parsed.data;

  try {
    const results = await retrieveChunks({ userId: req.user!.id, query, category, topK });
    res.json({ results, query });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    res.status(500).json({ error: message });
  }
});

export default router;
