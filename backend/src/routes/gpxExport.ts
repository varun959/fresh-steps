import { Router, Request, Response } from 'express';
import sql from '../db';

const router = Router();

// GET /api/gpx/:walkId - export a walk as a GPX file
router.get('/:walkId', async (req: Request, res: Response) => {
  try {
    const { walkId } = req.params;
    const [walk] = await sql`
      SELECT
        id,
        ST_AsGeoJSON(geometry)::json AS geometry,
        distance_meters,
        duration_seconds,
        completed_at
      FROM walks
      WHERE id = ${walkId}
    `;

    if (!walk) {
      return res.status(404).json({ error: 'Walk not found' });
    }

    const geom = walk.geometry as { type: 'LineString'; coordinates: [number, number][] }
    const completedAt = new Date(walk.completed_at ?? new Date())
    const durationMs = (walk.duration_seconds ?? 0) * 1000
    const coords = geom.coordinates ?? []
    const n = coords.length
    const trkpts = coords.map(([lng, lat], i) => {
      const t = new Date(completedAt.getTime() - durationMs + (n > 1 ? i / (n - 1) : 0) * durationMs)
      return `    <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}">\n      <time>${t.toISOString()}</time>\n    </trkpt>`
    }).join('\n')

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fresh Steps" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Walk ${walk.id}</name>
    <time>${walk.completed_at}</time>
  </metadata>
  <trk>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', `attachment; filename="walk-${walkId}.gpx"`);
    res.send(gpx);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export GPX' });
  }
});

export default router;
