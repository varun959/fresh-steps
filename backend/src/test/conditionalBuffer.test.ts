/**
 * Integration tests for the two-CTE walk→way matching logic.
 *
 * The fix replaced a correlated EXISTS subquery (scanned all footways per road → timeout)
 * with a two-step approach:
 *   1. matched_ways CTE  — all ways with ≥20m overlap under a flat 8m buffer (fast, indexed)
 *   2. roads_to_exclude  — roads in that small set that have a parallel matched footway
 *
 * Tests verify correctness (road next to footway is excluded) and performance (the real
 * walk that previously timed out now completes in < 5s).
 *
 * All geometry-logic tests use inline VALUES CTEs so no data is inserted/cleaned up.
 *
 * Coordinate setup (Baar area, ~47.196 N / 8.530 E):
 *   walk line  lat 47.196000  (east-west, ~76m)
 *   footway    lat 47.196027  (≈ 3m north of walk)
 *   road       lat 47.196063  (≈ 7m north of walk, within the 8m buffer)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'

let sql: ReturnType<typeof postgres>

beforeAll(() => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL required for integration tests')
  sql = postgres(url, { ssl: 'require' })
})

afterAll(async () => {
  await sql.end()
})

const WALK = JSON.stringify({
  type: 'LineString',
  coordinates: [[8.530, 47.196], [8.531, 47.196]],
})

// 3m north of walk (footway alongside road)
const FOOTWAY_GEOJSON = JSON.stringify({
  type: 'LineString',
  coordinates: [[8.530, 47.196027], [8.531, 47.196027]],
})

// 7m north of walk (road, with footway 4m south of it)
const ROAD_GEOJSON = JSON.stringify({
  type: 'LineString',
  coordinates: [[8.530, 47.196063], [8.531, 47.196063]],
})

/**
 * Runs the two-CTE matching query against a synthetic osm_ways table built from
 * the provided inline rows. Returns the ids of ways that would be credited.
 */
async function matchedWayIds(
  walkGeoJSON: string,
  inlineWays: { id: number; highway: string; geojson: string }[]
): Promise<number[]> {
  // Build a VALUES list: (id, highway, geom), ...
  const valuesSql = inlineWays
    .map(
      (w) =>
        `(${w.id}::bigint, '${w.highway}'::text, ST_GeomFromGeoJSON('${w.geojson}'))`
    )
    .join(',\n    ')

  const [{ ids }] = await sql.unsafe(`
    WITH osm_ways(id, highway, geometry) AS MATERIALIZED (
      VALUES ${valuesSql}
    ),
    matched_ways AS MATERIALIZED (
      SELECT id, highway, geometry
      FROM osm_ways w
      WHERE ST_DWithin(w.geometry::geography, ST_GeomFromGeoJSON('${walkGeoJSON}')::geography, 8)
        AND ST_Length(
          ST_Intersection(
            ST_Buffer(ST_GeomFromGeoJSON('${walkGeoJSON}')::geography, 8)::geometry,
            w.geometry
          )::geography
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
    SELECT ARRAY_AGG(m.id) AS ids
    FROM matched_ways m
    WHERE m.id NOT IN (SELECT id FROM roads_to_exclude)
  `)
  return (ids ?? []).map(Number)
}

describe('Conditional buffer — correctness', () => {
  it('footway alongside walk is credited (always 8m buffer)', async () => {
    const ids = await matchedWayIds(WALK, [
      { id: 1, highway: 'footway', geojson: FOOTWAY_GEOJSON },
    ])
    expect(ids).toContain(1)
  })

  it('road with no parallel footway along the walk is credited (8m buffer)', async () => {
    // Only the road, no footway → ELSE branch → 8m buffer → road at 7m is within buffer
    const ids = await matchedWayIds(WALK, [
      { id: 2, highway: 'residential', geojson: ROAD_GEOJSON },
    ])
    expect(ids).toContain(2)
  })

  it('road with a parallel footway along the walk is NOT credited (4m buffer)', async () => {
    // Footway at 3m triggers walk_footways CTE → road gets 4m buffer → road at 7m is outside
    const ids = await matchedWayIds(WALK, [
      { id: 1, highway: 'footway', geojson: FOOTWAY_GEOJSON },
      { id: 2, highway: 'residential', geojson: ROAD_GEOJSON },
    ])
    expect(ids).toContain(1)    // footway credited
    expect(ids).not.toContain(2) // road NOT credited
  })

  it('footway is credited even when a road is also present', async () => {
    const ids = await matchedWayIds(WALK, [
      { id: 1, highway: 'footway', geojson: FOOTWAY_GEOJSON },
      { id: 2, highway: 'residential', geojson: ROAD_GEOJSON },
    ])
    expect(ids).toContain(1)
  })

  it('path and cycleway always get 8m buffer regardless of nearby roads', async () => {
    for (const highway of ['path', 'cycleway', 'steps', 'pedestrian'] as const) {
      const ids = await matchedWayIds(WALK, [
        { id: 3, highway, geojson: FOOTWAY_GEOJSON },
      ])
      expect(ids).toContain(3)
    }
  })
})

describe('Conditional buffer — performance', () => {
  it('CTE matching query completes in < 5s on real walk with 88 candidate ways', async () => {
    // Uses the actual problematic walk (a031b910) that timed out with the old correlated EXISTS.
    // If this resolves, the CTE approach is fast enough.
    const walkId = 'a031b910-6008-4de9-bf60-983b81188bb6'

    const start = Date.now()
    const [{ count }] = await sql`
      WITH walk_geom AS MATERIALIZED (
        SELECT geometry AS geom,
               ST_Buffer(geometry, 0.000105) AS buf
        FROM walks WHERE id = ${walkId}::uuid
      ),
      matched_ways AS MATERIALIZED (
        SELECT w.id, w.highway, w.geometry
        FROM osm_ways w, walk_geom
        WHERE ST_DWithin(w.geometry, walk_geom.geom, 0.000120)
          AND ST_Length(ST_Intersection(walk_geom.buf, w.geometry)::geography) > 20
      ),
      roads_to_exclude AS (
        SELECT DISTINCT r.id
        FROM matched_ways r
        JOIN matched_ways fw
          ON fw.highway IN ('footway','path','cycleway','steps','pedestrian')
         AND ST_DWithin(fw.geometry::geography, r.geometry::geography, 8)
        WHERE r.highway NOT IN ('footway','path','cycleway','steps','pedestrian')
      )
      SELECT COUNT(*) AS count
      FROM matched_ways
      WHERE id NOT IN (SELECT id FROM roads_to_exclude)
    `
    const elapsed = Date.now() - start

    expect(Number(count)).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(5000)
  }, 10000) // 10s vitest timeout
})
