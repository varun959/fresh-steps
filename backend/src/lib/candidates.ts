/**
 * Generates 16 candidate waypoint sets for route suggestion:
 *   8 compass directions × 2 shapes (loop + one-way)
 *
 * Loop:    triangle [start, ptA, ptB, start] where ptA/ptB are at ±60° from
 *          the target direction — forces Valhalla to use 3 different road legs
 *          rather than reversing the same road (which [start, mid, start] does).
 * One-way: [start, endpoint_at_full_distance_in_direction]
 */

import type { Waypoint } from './valhalla';

export type RouteType = 'loop' | 'one-way' | 'out-and-back';

export interface CandidateWaypoints {
  type: RouteType;
  waypoints: Waypoint[];
  direction: number; // degrees 0-315 in 45° steps
}

/**
 * Project a point `distKm` away from (lat, lng) at compass angle `angleDeg`.
 * Uses flat-earth approximation (good enough for ≤ 10 km).
 */
function project(lat: number, lng: number, distKm: number, angleDeg: number): Waypoint {
  const θ = (angleDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const Δlat = (distKm / 111.32) * Math.cos(θ);
  const Δlng = (distKm / (111.32 * Math.cos(latRad))) * Math.sin(θ);
  return { lat: lat + Δlat, lng: lng + Δlng };
}

/**
 * Roads are longer than crow-flies distance.
 * Dividing the crow-flies waypoint distance by this factor means
 * Valhalla's actual road route ends up close to the requested distKm.
 * Empirically ~1.4 for Baar/Zurich urban network.
 */
const ROAD_FACTOR = 1.4;

export function generateCandidates(
  startLat: number,
  startLng: number,
  distKm: number,
): CandidateWaypoints[] {
  const candidates: CandidateWaypoints[] = [];
  const start: Waypoint = { lat: startLat, lng: startLng };

  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;

    // Loop: triangle [start → ptA → ptB → start].
    // ptA and ptB are at ±60° from angleDeg, each at distKm/3/ROAD_FACTOR crow-flies,
    // so the three road legs sum to ≈ distKm.
    const legDist = distKm / 3 / ROAD_FACTOR;
    const ptA = project(startLat, startLng, legDist, (angleDeg - 60 + 360) % 360);
    const ptB = project(startLat, startLng, legDist, (angleDeg + 60) % 360);
    candidates.push({
      type: 'loop',
      waypoints: [start, ptA, ptB, start],
      direction: angleDeg,
    });

    // One-way: road distance ≈ crow-flies × ROAD_FACTOR → invert to hit target.
    const end = project(startLat, startLng, distKm / ROAD_FACTOR, angleDeg);
    candidates.push({
      type: 'one-way',
      waypoints: [start, end],
      direction: angleDeg,
    });
  }

  return candidates; // 16 total
}
