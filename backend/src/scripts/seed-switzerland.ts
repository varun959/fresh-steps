/**
 * Seed OSM walkable road network for all of Switzerland.
 *
 * Generates a 0.1° lat × 0.15° lon grid over Switzerland's bounding box,
 * fetches each tile from Overpass, and upserts into osm_ways.
 * A 2-second delay between requests avoids Overpass rate limits.
 *
 * Run with:
 *   DATABASE_URL=... npx ts-node --transpile-only src/scripts/seed-switzerland.ts
 */

import postgres from 'postgres';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

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

// Switzerland bounding box
const SW_LAT = 45.80;
const NE_LAT = 47.85;
const SW_LON = 5.95;
const NE_LON = 10.50;
const LAT_STEP = 0.10;
const LON_STEP = 0.15;
const DELAY_MS = 2000;

interface OverpassNode { type: 'node'; id: number; lat: number; lon: number }
interface OverpassWay  { type: 'way';  id: number; nodes: number[]; tags?: Record<string, string> }
type OverpassElement = OverpassNode | OverpassWay;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOverpass(bbox: string): Promise<OverpassElement[]> {
  const query = `
[out:json][timeout:90];
(
  way["highway"~"^(${WALKABLE_HIGHWAY_TYPES})$"](${bbox});
);
out body;
>;
out skel qt;
  `.trim();

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) throw new Error(`Overpass ${response.status}: ${response.statusText}`);
  const data = await response.json() as { elements: OverpassElement[] };
  return data.elements;
}

async function seedTile(
  sql: postgres.Sql,
  bbox: string,
): Promise<number> {
  const elements = await fetchOverpass(bbox);

  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of elements) {
    if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon });
  }

  const rows: Array<{ id: number; name: string | null; highway: string; wkt: string }> = [];
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const tags = el.tags ?? {};
    const highway = tags['highway'];
    if (!highway) continue;
    const coords: string[] = [];
    for (const nodeId of el.nodes) {
      const node = nodes.get(nodeId);
      if (node) coords.push(`${node.lon} ${node.lat}`);
    }
    if (coords.length < 2) continue;
    rows.push({ id: el.id, name: tags['name'] ?? null, highway, wkt: `LINESTRING(${coords.join(',')})` });
  }

  if (rows.length === 0) return 0;

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const valuePlaceholders = chunk
      .map((_, j) => {
        const base = j * 4;
        return `($${base + 1}::bigint,$${base + 2},$${base + 3},ST_GeomFromText($${base + 4},4326))`;
      })
      .join(',');
    const params: (string | null)[] = chunk.flatMap(r => [String(r.id), r.name, r.highway, r.wkt]);
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
  }
  return inserted;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('DATABASE_URL required'); process.exit(1); }

  const sql = postgres(connectionString, { ssl: 'require', max: 3 });

  // Generate grid tiles
  const tiles: string[] = [];
  for (let lat = SW_LAT; lat < NE_LAT; lat = Math.round((lat + LAT_STEP) * 1000) / 1000) {
    for (let lon = SW_LON; lon < NE_LON; lon = Math.round((lon + LON_STEP) * 1000) / 1000) {
      const s = lat.toFixed(2);
      const w = lon.toFixed(2);
      const n = Math.min(lat + LAT_STEP, NE_LAT).toFixed(2);
      const e = Math.min(lon + LON_STEP, NE_LON).toFixed(2);
      tiles.push(`${s},${w},${n},${e}`);
    }
  }

  console.log(`Seeding Switzerland: ${tiles.length} tiles, ${LAT_STEP}°×${LON_STEP}° each\n`);

  let totalInserted = 0;
  let skipped = 0;

  for (let i = 0; i < tiles.length; i++) {
    const bbox = tiles[i];
    process.stdout.write(`[${i + 1}/${tiles.length}] bbox ${bbox} ... `);

    try {
      const n = await seedTile(sql, bbox);
      if (n === 0) {
        skipped++;
        process.stdout.write(`empty\n`);
      } else {
        totalInserted += n;
        process.stdout.write(`${n} ways\n`);
      }
    } catch (err) {
      process.stdout.write(`ERROR: ${(err as Error).message}\n`);
    }

    if (i < tiles.length - 1) await sleep(DELAY_MS);
  }

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM osm_ways`;
  console.log(`\nDone. Inserted ${totalInserted} ways (${skipped} empty tiles).`);
  console.log(`Total rows in osm_ways: ${count}`);

  await sql.end();
}

main().catch(err => { console.error(err); process.exit(1); });
