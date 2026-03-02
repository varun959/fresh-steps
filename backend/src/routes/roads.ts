import { Router, Request, Response } from 'express';
import sql from '../db';

const router = Router();

// GET /api/roads?bbox=minLon,minLat,maxLon,maxLat&userId=optional
//
// Returns a GeoJSON FeatureCollection of OSM ways within the viewport.
// Each feature has a `status` property:
//   "fresh"   — neither side walked (green)
//   "partial" — one side walked (yellow)
//   "covered" — both sides walked (gray)
//
// If no userId is provided, all roads are returned as "fresh".
// Capped at 2000 ways to avoid overloading the frontend renderer.
router.get('/', async (req: Request, res: Response) => {
  const { bbox, userId } = req.query as Record<string, string>;

  if (!bbox) {
    return res.status(400).json({ error: 'bbox query param required (minLon,minLat,maxLon,maxLat)' });
  }

  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return res.status(400).json({ error: 'bbox must be four comma-separated numbers' });
  }

  const [minLon, minLat, maxLon, maxLat] = parts;

  try {
    let rows;

    if (userId) {
      // With coverage status per way
      rows = await sql`
        SELECT
          w.id,
          w.name,
          w.highway,
          ST_AsGeoJSON(w.geometry)::json AS geometry,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM covered_segments cs
              WHERE cs.osm_way_id = w.id
                AND cs.user_id = ${userId}::uuid
                AND cs.side = 'left'
            ) AND EXISTS (
              SELECT 1 FROM covered_segments cs
              WHERE cs.osm_way_id = w.id
                AND cs.user_id = ${userId}::uuid
                AND cs.side = 'right'
            ) THEN 'covered'
            WHEN EXISTS (
              SELECT 1 FROM covered_segments cs
              WHERE cs.osm_way_id = w.id
                AND cs.user_id = ${userId}::uuid
            ) THEN 'partial'
            ELSE 'fresh'
          END AS status
        FROM osm_ways w
        WHERE ST_Intersects(
          w.geometry,
          ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)
        )
        LIMIT 2000
      `;
    } else {
      // No user — return all roads as fresh
      rows = await sql`
        SELECT
          w.id,
          w.name,
          w.highway,
          ST_AsGeoJSON(w.geometry)::json AS geometry,
          'fresh' AS status
        FROM osm_ways w
        WHERE ST_Intersects(
          w.geometry,
          ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)
        )
        LIMIT 2000
      `;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: rows.map((row) => ({
        type: 'Feature',
        id: row.id,
        geometry: row.geometry,
        properties: {
          id: row.id,
          name: row.name,
          highway: row.highway,
          status: row.status,
        },
      })),
    };

    res.json(geojson);
  } catch (err) {
    console.error('Roads endpoint error:', err);
    res.status(500).json({ error: 'Failed to fetch roads' });
  }
});

export default router;
