/**
 * Valhalla routing client for Stadia Maps.
 *
 * Decodes Google-format encoded polylines (precision 6) inline —
 * no extra dependency needed.
 */

export interface Waypoint {
  lat: number;
  lng: number;
}

/** Decode a Google-format encoded polyline (precision 6) → [lng, lat][] */
function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    // Decode latitude delta
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    // Decode longitude delta
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coords.push([lng / 1e6, lat / 1e6]); // GeoJSON order: [lng, lat]
  }

  return coords;
}

export interface RouteResult {
  coords: [number, number][]; // GeoJSON order [lng, lat]
  durationSeconds: number;    // Valhalla's own pedestrian time estimate
}

/** Decode a Valhalla trip object (multi-leg) into a RouteResult. */
function decodeTrip(trip: { legs: Array<{ shape: string }>; summary: { time: number } }): RouteResult {
  const allCoords: [number, number][] = [];
  for (let i = 0; i < trip.legs.length; i++) {
    const legCoords = decodePolyline(trip.legs[i].shape);
    allCoords.push(...(i === 0 ? legCoords : legCoords.slice(1)));
  }
  return { coords: allCoords, durationSeconds: Math.round(trip.summary.time) };
}

/**
 * Fetch a pedestrian route from Stadia Maps Valhalla.
 */
export async function fetchRoute(waypoints: Waypoint[], apiKey: string): Promise<RouteResult> {
  const body = {
    locations: waypoints.map((wp) => ({ lon: wp.lng, lat: wp.lat, type: 'break' })),
    costing: 'pedestrian',
    directions_options: { units: 'km' },
  };

  const url = `https://api.stadiamaps.com/route?api_key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Valhalla ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as {
    trip: { legs: Array<{ shape: string }>; summary: { length: number; time: number } };
  };

  return decodeTrip(data.trip);
}

/**
 * Fetch a point-to-point pedestrian route plus up to `maxAlternates` alternatives.
 * Returns an array of RouteResults (primary first, then alternates).
 */
export async function fetchRouteAlternates(
  start: Waypoint,
  end: Waypoint,
  apiKey: string,
  maxAlternates = 2,
): Promise<RouteResult[]> {
  const body = {
    locations: [
      { lon: start.lng, lat: start.lat, type: 'break' },
      { lon: end.lng, lat: end.lat, type: 'break' },
    ],
    costing: 'pedestrian',
    directions_options: { units: 'km' },
    alternates: maxAlternates,
  };

  const url = `https://api.stadiamaps.com/route?api_key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Valhalla ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as {
    trip: { legs: Array<{ shape: string }>; summary: { time: number } };
    alternates?: Array<{ trip: { legs: Array<{ shape: string }>; summary: { time: number } } }>;
  };

  return [
    decodeTrip(data.trip),
    ...(data.alternates ?? []).map((a) => decodeTrip(a.trip)),
  ];
}
