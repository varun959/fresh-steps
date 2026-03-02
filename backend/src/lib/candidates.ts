/**
 * Generates 16 candidate waypoint sets for route suggestion:
 *   8 compass directions × 2 shapes (loop + one-way)
 *
 * Loop:    [start, midpoint_at_half_distance_in_direction, start]
 * One-way: [start, endpoint_at_full_distance_in_direction]
 */

import type { Waypoint } from './valhalla';

export type RouteType = 'loop' | 'one-way';

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

export function generateCandidates(
  startLat: number,
  startLng: number,
  distKm: number,
): CandidateWaypoints[] {
  const candidates: CandidateWaypoints[] = [];
  const start: Waypoint = { lat: startLat, lng: startLng };

  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;

    // Loop: go to midpoint then return to start
    const mid = project(startLat, startLng, distKm / 2, angleDeg);
    candidates.push({
      type: 'loop',
      waypoints: [start, mid, start],
      direction: angleDeg,
    });

    // One-way: go straight to endpoint
    const end = project(startLat, startLng, distKm, angleDeg);
    candidates.push({
      type: 'one-way',
      waypoints: [start, end],
      direction: angleDeg,
    });
  }

  return candidates; // 16 total
}
