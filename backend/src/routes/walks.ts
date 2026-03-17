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

    // Find OSM ways that overlap the walk path sufficiently to be considered "covered".
    //
    // Buffer sizes are highway-type-aware:
    //   - footway / path / cycleway / steps / pedestrian → 8m
    //     (GPS on a sidewalk can be 3–6m off; we need margin to reach the way geometry)
    //   - all road types (residential, tertiary, primary, …) → 4m
    //     (Swiss OSM maps sidewalks as separate footway ways running 3–8m alongside the
    //     road centerline; an 8m buffer would credit the road whenever you walk on its
    //     parallel footway. 4m prevents that without losing genuine road coverage.)
    //
    // The ST_DWithin(…, 8) pre-filter uses the larger value so the index scan catches
    // all candidates; the ST_Buffer CASE expression then applies the correct size.
    // The 20m overlap threshold still filters out perpendicular cross-streets.
    // Way-matching uses geometry (not geography) for the DWithin pre-filter so that
    // the GiST index on osm_ways.geometry is used. geography DWithin causes a full
    // table scan on 768K rows (30+ seconds). Degree-equivalent distances at 42–50° lat:
    //   8m  ≈ 0.000105° (longitude at 47°N, safe upper bound)
    //   pre-filter uses 0.000120° to avoid missing ways at bbox edges
    //
    // Two-CTE approach:
    //   1. matched_ways  — index-backed pre-filter + planar intersection > 20m
    //   2. roads_to_exclude — roads with a parallel matched footway (Swiss OSM pattern)
    //      The join is on ~15–20 rows, so geography DWithin is fine there.
    const ways = await sql`
      WITH walk_geom AS MATERIALIZED (
        SELECT ST_GeomFromGeoJSON(${lineGeoJSON}) AS geom,
               ST_Buffer(ST_GeomFromGeoJSON(${lineGeoJSON}), 0.000105) AS buf
      ),
      matched_ways AS MATERIALIZED (
        SELECT w.id, w.highway, w.geometry
        FROM osm_ways w, walk_geom
        WHERE ST_DWithin(w.geometry, walk_geom.geom, 0.000120)
          AND ST_Length(
            ST_Intersection(walk_geom.buf, w.geometry)::geography
          ) > 20
      ),
      roads_to_exclude AS (
        SELECT DISTINCT r.id
        FROM matched_ways r
        JOIN matched_ways fw
          ON fw.highway IN ('footway','path','cycleway','steps','pedestrian')
         AND ST_DWithin(fw.geometry::geography, r.geometry::geography, 8)
        WHERE r.highway NOT IN ('footway','path','cycleway','steps','pedestrian')
      )
      SELECT id, ST_AsGeoJSON(geometry)::json AS geometry
      FROM matched_ways
      WHERE id NOT IN (SELECT id FROM roads_to_exclude)
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

// DELETE /api/walks/:id
// Removes the walk and its covered_segments (cleanup for test/bad recordings)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM covered_segments WHERE walk_id = ${id}::uuid`;
    const [deleted] = await sql`DELETE FROM walks WHERE id = ${id}::uuid RETURNING id`;
    if (!deleted) return res.status(404).json({ error: 'Walk not found' });
    res.json({ deleted: deleted.id });
  } catch (err) {
    console.error('Walk delete error:', err);
    res.status(500).json({ error: 'Failed to delete walk' });
  }
});

export default router;
