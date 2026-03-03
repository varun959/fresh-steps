import { Router, Request, Response } from 'express';
import sql from '../db';
import type postgres from 'postgres';

const router = Router();

// POST /api/walks
// Body: { userId, coordinates: [lng, lat][], startedAt, completedAt }
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, coordinates, startedAt, completedAt } = req.body as {
      userId: string
      coordinates: [number, number][]
      startedAt: string
      completedAt: string
    };

    if (!coordinates || coordinates.length < 2) {
      return res.status(400).json({ error: 'At least 2 coordinates required' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const durationSeconds = Math.round(
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
    );

    // Build GeoJSON LineString for PostGIS
    const lineGeoJSON = JSON.stringify({
      type: 'LineString',
      coordinates,
    });

    // Insert walk — compute distance via ST_Length(::geography) at insert time
    const [walk] = await sql`
      INSERT INTO walks (user_id, geometry, duration_seconds, completed_at, distance_meters)
      VALUES (
        ${userId}::uuid,
        ST_GeomFromGeoJSON(${lineGeoJSON}),
        ${durationSeconds},
        ${completedAt}::timestamptz,
        ROUND(ST_Length(ST_GeomFromGeoJSON(${lineGeoJSON})::geography)::numeric, 2)
      )
      RETURNING id, distance_meters
    `;

    // Find nearby OSM ways within 15 metres of the walk
    const ways = await sql`
      SELECT
        id,
        ST_AsGeoJSON(geometry)::json AS geometry
      FROM osm_ways
      WHERE ST_DWithin(geometry::geography, ST_GeomFromGeoJSON(${lineGeoJSON})::geography, 15)
    `;

    // Upsert covered_segments for both sides of each matched way
    // Cast tx: Omit<Sql,…> doesn't preserve call signatures in TS (postgres.js typing limitation)
    await sql.begin(async (tx) => {
      const q = tx as unknown as postgres.Sql
      for (const way of ways) {
        const geom = JSON.stringify(way.geometry);
        for (const side of ['left', 'right'] as const) {
          await q`
            INSERT INTO covered_segments (user_id, walk_id, osm_way_id, side, geometry, covered_at)
            VALUES (
              ${userId}::uuid,
              ${walk.id}::uuid,
              ${way.id}::bigint,
              ${side},
              ST_GeomFromGeoJSON(${geom}),
              NOW()
            )
            ON CONFLICT (user_id, osm_way_id, side) DO UPDATE
              SET walk_id = EXCLUDED.walk_id,
                  covered_at = EXCLUDED.covered_at
          `;
        }
      }
    });

    res.json({
      walkId: walk.id,
      distanceMeters: Number(walk.distance_meters),
      durationSeconds,
      coveredWayCount: ways.length,
    });
  } catch (err) {
    console.error('Walk save error:', err);
    res.status(500).json({ error: 'Failed to save walk' });
  }
});

export default router;
