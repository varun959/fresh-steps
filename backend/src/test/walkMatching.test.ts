/**
 * Integration tests for the walk→way matching SQL logic.
 *
 * These tests run actual PostGIS queries but touch no tables — all geometry
 * is constructed inline. This means no test data setup/teardown and no risk
 * of polluting the DB.
 *
 * The key invariant: a way is credited only if ST_Length(ST_Intersection(
 *   ST_Buffer(walk::geography, 8)::geometry, way)) > 20m.
 * A perpendicular cross-street at an intersection overlaps the buffer for
 * ~16m (2 × 8m), so it should be filtered out.
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

/** Overlap in metres between a buffered walk line and a way line, using our matching query. */
async function overlapMeters(walkGeoJSON: object, wayGeoJSON: object): Promise<number> {
  const walk = JSON.stringify(walkGeoJSON)
  const way = JSON.stringify(wayGeoJSON)
  const [{ overlap }] = await sql`
    SELECT ROUND(
      ST_Length(
        ST_Intersection(
          ST_Buffer(ST_GeomFromGeoJSON(${walk})::geography, 8)::geometry,
          ST_GeomFromGeoJSON(${way})
        )::geography
      )::numeric, 1
    ) AS overlap
  `
  return Number(overlap)
}

describe('Walk matching — overlap length filter', () => {
  // Walk: ~76m east-west line at lat 47.196 (Baar area)
  const walkLine = {
    type: 'LineString',
    coordinates: [[8.530, 47.196], [8.531, 47.196]],
  }

  it('perpendicular cross-street has < 20m overlap → not credited', async () => {
    // North-south road crossing the walk at its midpoint
    const crossStreet = {
      type: 'LineString',
      coordinates: [[8.5305, 47.1950], [8.5305, 47.1970]],
    }
    const overlap = await overlapMeters(walkLine, crossStreet)
    // Cross-street enters and exits the 8m buffer: overlap ≈ 16m
    expect(overlap).toBeLessThan(20)
  })

  it('parallel road within 8m has > 20m overlap → credited', async () => {
    // East-west road 5m north of the walk (5m ≈ 0.000045° lat)
    const parallelRoad = {
      type: 'LineString',
      coordinates: [[8.530, 47.19604], [8.531, 47.19604]],
    }
    const overlap = await overlapMeters(walkLine, parallelRoad)
    // Entire parallel road falls inside the buffer → overlap ≈ full road length (~76m)
    expect(overlap).toBeGreaterThan(20)
  })

  it('road outside 8m buffer has 0 overlap → not credited', async () => {
    // East-west road 20m north of the walk (20m ≈ 0.00018° lat)
    const farRoad = {
      type: 'LineString',
      coordinates: [[8.530, 47.19618], [8.531, 47.19618]],
    }
    const overlap = await overlapMeters(walkLine, farRoad)
    expect(overlap).toBe(0)
  })

  it('short road (<20m) alongside walk is not credited even if fully overlapping', async () => {
    // 15m east-west road 3m north, fully within buffer
    // 15m at 47° lat ≈ 0.000135° lng
    const shortRoad = {
      type: 'LineString',
      coordinates: [[8.5300, 47.19603], [8.53013, 47.19603]],
    }
    const overlap = await overlapMeters(walkLine, shortRoad)
    // This documents the known regression: roads < 20m won't be credited
    expect(overlap).toBeLessThan(20)
  })
})
