import { Router, Request, Response } from 'express';
import sql from '../db';

const router = Router();

// GET /api/coverage/:userId - fetch all covered segments for a user
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const segments = await sql`
      SELECT
        id,
        osm_way_id,
        side,
        ST_AsGeoJSON(geometry)::json AS geometry,
        covered_at
      FROM covered_segments
      WHERE user_id = ${userId}
      ORDER BY covered_at DESC
    `;
    res.json({ segments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coverage data' });
  }
});

// POST /api/coverage - record a new covered segment
router.post('/', async (req: Request, res: Response) => {
  // Placeholder — will be implemented in Phase 2 (Walk Tracking)
  res.status(501).json({ message: 'Not yet implemented' });
});

export default router;
