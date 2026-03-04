import { Router, Request, Response } from 'express';
import sql from '../db';
import { fetchRoute } from '../lib/valhalla';
import { generateCandidates, type CandidateWaypoints } from '../lib/candidates';

const router = Router();

const DEMO_USER_ID = process.env.DEMO_USER_ID;

interface SuggestBody {
  startLat: number;
  startLng: number;
  durationMinutes: number;
  userId?: string;
}

interface RouteResult {
  type: 'loop' | 'one-way' | 'out-and-back';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  distanceKm: number;
  durationMinutes: number;
  freshnessPercent: number;
}

/**
 * For a loop candidate, check whether the route retraces the same road
 * (out-and-back) vs. covering different roads (true loop).
 *
 * Splits the route at its midpoint, samples 6 points from the second half,
 * and finds the minimum distance from each to any point on the first half.
 * If the average minimum distance is < 50 m, the second half closely mirrors
 * the first — it's an out-and-back route.
 */
function classifyLoopType(coords: [number, number][]): 'loop' | 'out-and-back' {
  if (coords.length < 6) return 'loop';
  const mid = Math.floor(coords.length / 2);
  const firstHalf = coords.slice(0, mid);
  const secondHalf = coords.slice(mid);

  const step = Math.max(1, Math.floor(secondHalf.length / 6));
  const samples = secondHalf.filter((_, i) => i % step === 0).slice(0, 6);

  let totalMinDist = 0;
  for (const [lng2, lat2] of samples) {
    let minDist = Infinity;
    for (const [lng1, lat1] of firstHalf) {
      const dy = (lat2 - lat1) * 111320;
      const dx = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    totalMinDist += minDist;
  }
  return totalMinDist / samples.length < 50 ? 'out-and-back' : 'loop';
}

/**
 * Score a route's freshness by intersecting its geometry against covered_segments.
 * Returns a percentage of uncovered distance (higher = more fresh).
 */
async function scoreFreshness(
  coordinates: [number, number][],
  userId: string,
): Promise<number> {
  const geojson = JSON.stringify({
    type: 'LineString',
    coordinates,
  });

  const [row] = await sql`
    SELECT
      ST_Length(ST_GeomFromGeoJSON(${geojson})::geography) AS total_m,
      COALESCE(SUM(
        ST_Length(
          ST_Intersection(
            cs.geometry::geography,
            ST_GeomFromGeoJSON(${geojson})::geography
          )
        )
      ), 0) AS covered_m
    FROM covered_segments cs
    WHERE cs.user_id = ${userId}::uuid
      AND ST_Intersects(cs.geometry, ST_GeomFromGeoJSON(${geojson}))
  `;

  const totalM = Number(row.total_m) || 0;
  const coveredM = Number(row.covered_m) || 0;
  if (totalM === 0) return 100;
  return ((totalM - coveredM) / totalM) * 100;
}

/** Estimate walking distance in km from coordinate list (Haversine). */
function coordinatesToDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

// POST /api/routes/suggest
router.post('/suggest', async (req: Request, res: Response) => {
  const { startLat, startLng, durationMinutes, userId } = req.body as SuggestBody;

  if (!startLat || !startLng || !durationMinutes) {
    return res.status(400).json({ error: 'startLat, startLng, and durationMinutes are required' });
  }
  if (durationMinutes < 5 || durationMinutes > 480) {
    return res.status(400).json({ error: 'durationMinutes must be between 5 and 480' });
  }

  const apiKey = process.env.STADIA_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'STADIA_MAPS_API_KEY not configured' });
  }

  const effectiveUserId = userId ?? DEMO_USER_ID;

  // 1. Convert duration to target distance (walking at ~5 km/h)
  const targetDistanceKm = (durationMinutes / 60) * 5;

  // 2. Generate 16 candidate waypoint sets
  const candidates: CandidateWaypoints[] = generateCandidates(startLat, startLng, targetDistanceKm);

  // 3. Fetch all 16 routes from Valhalla in parallel (skip failed ones)
  const routeResults = await Promise.allSettled(
    candidates.map((c) => fetchRoute(c.waypoints, apiKey).then((result) => ({ c, ...result }))),
  );

  const validRoutes: Array<{ c: CandidateWaypoints; coords: [number, number][]; durationSeconds: number }> = [];
  for (const result of routeResults) {
    if (result.status === 'fulfilled') {
      validRoutes.push(result.value);
    } else {
      console.warn('Valhalla route failed:', (result.reason as Error).message);
    }
  }

  if (validRoutes.length === 0) {
    return res.status(502).json({ error: 'All Valhalla route requests failed' });
  }

  // 4. Score freshness in parallel (or return 100% if no userId)
  //    Filter out routes whose Valhalla duration deviates >35% from the request
  //    so badly-fitting candidates don't crowd out good ones.
  const targetSeconds = durationMinutes * 60;
  const scored: RouteResult[] = (
    await Promise.all(
      validRoutes.map(async ({ c, coords, durationSeconds }) => {
        const ratio = durationSeconds / targetSeconds;
        if (ratio < 0.65 || ratio > 1.35) return null; // too short or too long

        const distanceKm = coordinatesToDistanceKm(coords);
        const freshnessPercent = effectiveUserId
          ? await scoreFreshness(coords, effectiveUserId).catch(() => 100)
          : 100;

        const type = c.type === 'loop' ? classifyLoopType(coords) : c.type;
        return {
          type,
          geometry: { type: 'LineString' as const, coordinates: coords },
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationMinutes: Math.round(durationSeconds / 60),
          freshnessPercent: Math.round(freshnessPercent * 10) / 10,
        } satisfies RouteResult;
      }),
    )
  ).filter((r): r is RouteResult => r !== null);

  // 5. Sort by freshness descending, return top 3
  //    If the filter left fewer than 3, relax and take the closest-duration ones.
  if (scored.length < 3) {
    const extras = validRoutes
      .filter(({ durationSeconds }) => {
        const ratio = durationSeconds / targetSeconds;
        return ratio >= 0.65 && ratio <= 1.35;
      });
    if (extras.length === 0) {
      // All routes were filtered; fall back to the 3 closest to target duration
      validRoutes.sort((a, b) =>
        Math.abs(a.durationSeconds - targetSeconds) - Math.abs(b.durationSeconds - targetSeconds)
      );
      for (const { c, coords, durationSeconds } of validRoutes.slice(0, 3)) {
        if (scored.some(s => s.geometry.coordinates === coords)) continue;
        const distanceKm = coordinatesToDistanceKm(coords);
        const type = c.type === 'loop' ? classifyLoopType(coords) : c.type;
        scored.push({
          type,
          geometry: { type: 'LineString' as const, coordinates: coords },
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationMinutes: Math.round(durationSeconds / 60),
          freshnessPercent: 100,
        });
      }
    }
  }

  scored.sort((a, b) => b.freshnessPercent - a.freshnessPercent);
  const top3 = scored.slice(0, 3);

  res.json({ routes: top3 });
});

export default router;
