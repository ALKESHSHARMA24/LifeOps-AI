import { Router, Request, Response } from "express";
import { getDashboardStats, getAttentionItems } from "../../modules/intelligence/attention.service";
import { getTimelineCommitments } from "../../modules/intelligence/attention.service";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/dashboard — stats + attention items
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const [stats, attention] = await Promise.all([
    getDashboardStats(userId),
    getAttentionItems(userId),
  ]);
  res.json({ stats, attention });
});

// GET /api/dashboard/timeline — all commitments sorted by date
router.get("/timeline", requireAuth, async (req: Request, res: Response) => {
  const commitments = await getTimelineCommitments(req.user!.id);
  res.json({ commitments });
});

export default router;
