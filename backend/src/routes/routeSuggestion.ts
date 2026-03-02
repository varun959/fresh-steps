import { Router, Request, Response } from 'express';

const router = Router();

// POST /api/routes/suggest
// Body: { userId, startLat, startLng, durationMinutes, type: 'loop'|'one-way'|'out-and-back' }
router.post('/suggest', async (_req: Request, res: Response) => {
  // Placeholder — will be implemented in Phase 3 (Route Suggestion + Valhalla)
  res.status(501).json({ message: 'Route suggestion not yet implemented' });
});

export default router;
