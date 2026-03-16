import { Router, Request, Response } from 'express';
import sql from '../db';
import { fetchRoute, fetchRouteAlternates } from '../lib/valhalla';
import { generateCandidates, type CandidateWaypoints } from '../lib/candidates';
import { classifyLoopType } from '../lib/routeClassifier';

const router = Router();

const DEMO_USER_ID = process.env.DEMO_USER_ID;

interface SuggestBody {
  startLat: number;
  startLng: number;
  durationMinutes: number;
  endLat?: number;
  endLng?: number;
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
  const { startLat, startLng, durationMinutes, endLat, endLng, userId } = req.body as SuggestBody;

  if (!startLat || !startLng) {
    return res.status(400).json({ error: 'startLat and startLng are required' });
  }
  // durationMinutes is only required for loop mode (no end pin)
  if (!endLat && !endLng && !durationMinutes) {
    return res.status(400).json({ error: 'durationMinutes is required when no end point is provided' });
  }
  if (durationMinutes && (durationMinutes < 5 || durationMinutes > 480)) {
    return res.status(400).json({ error: 'durationMinutes must be between 5 and 480' });
  }

  const apiKey = process.env.STADIA_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'STADIA_MAPS_API_KEY not configured' });
  }

  const effectiveUserId = userId ?? DEMO_USER_ID;

  // --- Point-to-point mode: start pin + end pin ---
  if (endLat && endLng) {
    let routes: RouteResult[];
    try {
      const results = await fetchRouteAlternates(
        { lat: startLat, lng: startLng },
        { lat: endLat, lng: endLng },
        apiKey,
      );
      routes = await Promise.all(
        results.map(async ({ coords, durationSeconds }) => {
          const distanceKm = coordinatesToDistanceKm(coords);
          const freshnessPercent = effectiveUserId
            ? await scoreFreshness(coords, effectiveUserId).catch(() => 100)
            : 100;
          return {
            type: 'one-way' as const,
            geometry: { type: 'LineString' as const, coordinates: coords },
            distanceKm: Math.round(distanceKm * 10) / 10,
            durationMinutes: Math.round(durationSeconds / 60),
            freshnessPercent: Math.round(freshnessPercent * 10) / 10,
          };
        }),
      );
    } catch (err) {
      console.error('P2P Valhalla error:', (err as Error).message);
      return res.status(502).json({ error: 'Routing failed — check that start and end are reachable on foot' });
    }
    routes.sort((a, b) => b.freshnessPercent - a.freshnessPercent);
    return res.json({ routes });
  }

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

  // 6. Pick one best of each type first, then fill remaining slots by freshness.
  //    This ensures diversity: e.g. loop + one-way + out-and-back rather than
  //    three loops even if loops dominate by freshness score.
  const types: RouteResult['type'][] = ['loop', 'one-way', 'out-and-back'];
  const top3: RouteResult[] = [];
  for (const t of types) {
    const best = scored.find(r => r.type === t);
    if (best) top3.push(best);
  }
  for (const r of scored) {
    if (top3.length >= 3) break;
    if (!top3.includes(r)) top3.push(r);
  }

  res.json({ routes: top3 });
});

export default router;
