/**
 * Seed OSM walkable road network for Baar and Zurich.
 *
 * Fetches ways from Overpass API, reconstructs LineString geometries,
 * and upserts into the osm_ways table.
 *
 * Run with:
 *   DATABASE_URL=... npx ts-node src/scripts/seed-osm.ts
 */

import postgres from 'postgres';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Highway types walkable on foot (both roads with sidewalks and dedicated foot paths)
const WALKABLE_HIGHWAY_TYPES = [
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service',
  'pedestrian',
  'footway',
  'path',
  'cycleway',
  'steps',
  'track',
].join('|');

const AREAS = [
  {
    name: 'Baar, Switzerland',
    // Bounding box: south, west, north, east (Overpass format)
    bbox: '47.14,8.47,47.24,8.59',
  },
  {
    name: 'Zurich, Switzerland',
    bbox: '47.32,8.44,47.43,8.61',
  },
  { name: 'Bangalore South', bbox: '12.80,77.52,12.86,77.72' },
  { name: 'Bangalore SW', bbox: '12.86,77.52,12.95,77.62' },
  { name: 'Bangalore SE', bbox: '12.86,77.62,12.95,77.72' },
  { name: 'Bangalore NW', bbox: '12.95,77.52,13.04,77.62' },
  { name: 'Bangalore NE-S', bbox: '12.95,77.62,13.00,77.72' },
  { name: 'Bangalore NE-N', bbox: '13.00,77.62,13.04,77.72' },
  { name: 'NYC Manhattan S', bbox: '40.70,-74.02,40.79,-73.91' },
  { name: 'NYC Manhattan N-W', bbox: '40.79,-74.02,40.88,-73.96' },
  { name: 'NYC Manhattan N-E', bbox: '40.79,-73.96,40.88,-73.91' },
  { name: 'Andover MA', bbox: '42.60,-71.23,42.70,-71.09' },
  { name: 'North Andover MA', bbox: '42.63,-71.18,42.75,-71.05' },
];

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

type OverpassElement = OverpassNode | OverpassWay;

interface OverpassResponse {
  elements: OverpassElement[];
}

async function fetchOverpass(bbox: string): Promise<OverpassResponse> {
  const query = `
[out:json][timeout:90];
(
  way["highway"~"^(${WALKABLE_HIGHWAY_TYPES})$"](${bbox});
);
out body;
>;
out skel qt;
  `.trim();

  console.log(`  Querying Overpass for bbox ${bbox}...`);
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OverpassResponse>;
}

async function seedArea(
  sql: postgres.Sql,
  area: { name: string; bbox: string }
): Promise<number> {
  console.log(`\nSeeding ${area.name}...`);
  const data = await fetchOverpass(area.bbox);

  // Build node lookup: id → {lat, lon}
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Build rows from ways
  const rows: Array<{
    id: number;
    name: string | null;
    highway: string;
    wkt: string;
  }> = [];

  for (const el of data.elements) {
    if (el.type !== 'way') continue;
    const tags = el.tags ?? {};
    const highway = tags['highway'];
    if (!highway) continue;

    // Reconstruct coordinates from node IDs
    const coords: string[] = [];
    for (const nodeId of el.nodes) {
      const node = nodes.get(nodeId);
      if (node) coords.push(`${node.lon} ${node.lat}`);
    }

    if (coords.length < 2) continue; // skip degenerate ways

    rows.push({
      id: el.id,
      name: tags['name'] ?? null,
      highway,
      wkt: `LINESTRING(${coords.join(',')})`,
    });
  }

  console.log(`  Found ${rows.length} walkable ways`);

  if (rows.length === 0) return 0;

  // Batch upsert in chunks of 200
  // Uses sql.unsafe() with positional params to support ST_GeomFromText in a VALUES clause
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    // Build: ($1::bigint,$2,$3,ST_GeomFromText($4,4326)), ($5::bigint,...), ...
    const valuePlaceholders = chunk
      .map((_, j) => {
        const base = j * 4;
        return `($${base + 1}::bigint,$${base + 2},$${base + 3},ST_GeomFromText($${base + 4},4326))`;
      })
      .join(',');

    const params: (string | null)[] = chunk.flatMap(r => [
      String(r.id),
      r.name,
      r.highway,
      r.wkt,
    ]);

    await sql.unsafe(
      `INSERT INTO osm_ways (id, name, highway, geometry)
       VALUES ${valuePlaceholders}
       ON CONFLICT (id) DO UPDATE SET
         name     = EXCLUDED.name,
         highway  = EXCLUDED.highway,
         geometry = EXCLUDED.geometry`,
      params
    );

    inserted += chunk.length;
    process.stdout.write(`\r  Inserted ${inserted}/${rows.length}...`);
  }
  console.log(`\r  Upserted ${inserted} ways for ${area.name}  `);
  return inserted;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const sql = postgres(connectionString, { ssl: 'require', max: 5 });

  let total = 0;
  const areasToRun = process.env.SEED_AREAS ? AREAS.filter(a => process.env.SEED_AREAS!.split(',').some(n => a.name.toLowerCase().includes(n.toLowerCase()))) : AREAS;
  for (const area of areasToRun) {
    total += await seedArea(sql, area);
  }

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM osm_ways`;
  console.log(`\nDone. Total rows in osm_ways: ${count} (seeded ${total} this run)`);

  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
