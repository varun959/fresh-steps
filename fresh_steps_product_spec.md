# Fresh Steps — Product Specification

**Version:** 0.6
**Status:** MVP In Development
**Last Updated:** March 23, 2026

---

## 1. Overview

Fresh Steps is a mobile walking exploration app that rewards users for walking new streets. It tracks sidewalk coverage per side, suggests routes that maximize unexplored roads, and records GPS walks — replacing the manual workflow of combining wandrer.earth, ridewithgps, and Strava.

### Pilot User

First user lives in Baar (Zug), works in Zurich. Avid cyclist recovering from injury, walking in the interim. Wants to maximize exploration of fresh (unwalked) roads. In Baar, drives to a start location; in Zurich, takes transit. One-way routes ending at a tram/bus stop are equally appealing as loops.

### Target Cities

Baar (Zug), Zurich, Bangalore, New York City (Manhattan). Expandable to any city via OSM data seeding.

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Route planning | App suggests routes, user picks | User wants the app to do the thinking |
| Duration input | Time-based ("45 minutes") | More natural than distance-based |
| Walking speed | ~5 km/h assumed | Can be personalized post-MVP |
| Navigation | Handoff to Google Maps | Turn-by-turn is out of scope; delegate to native maps |
| Walk import | GPX export, manual import | Strava history is cycling-only; GPX gives portability |
| ORM | None — postgres.js raw SQL | PostGIS spatial queries require raw SQL; one consistent pattern |
| App type | PWA | One codebase, installable on home screen, good enough for MVP |

---

## 3. Features

### 3.1 Coverage Map

Roads are color-coded by sidewalk coverage status, loaded dynamically as the user pans/zooms (min zoom: 13):

| Color | Meaning |
|-------|---------|
| Red | Unwalked (both sides fresh) |
| Yellow | One side walked, one still fresh |
| Green | Both sides covered |

Coverage is tracked **per sidewalk side** (left/right), not per road. Walking one side leaves the other fresh.

**Implementation:**
- OSM road network seeded from Overpass API into `osm_ways` table
- Walk GPS matched to nearby ways (within 8 metres) via `ST_DWithin`
- Covered segments stored in `covered_segments` with `side: left | right`
- Roads API: `GET /api/roads?bbox=minLon,minLat,maxLon,maxLat&userId=`
- Canvas renderer (L.canvas) for performance with 2000+ polylines

### 3.2 Route Suggestion

Two modes depending on whether the user places one or two pins:

**Loop mode (one pin):**
1. User sets a start pin and enters walk duration (slider: 15–120 min)
2. App generates 16 candidates: 8 triangle loops (N, NE, E, SE, S, SW, W, NW) + 8 one-way variants
   - Loops use 3 waypoints at ±60° from the target direction to force genuinely different outbound and return roads
3. Each candidate is routed via Valhalla (Stadia Maps hosted) with pedestrian costing
4. Freshness score: `(total_m - covered_m) / total_m × 100` — covered_m computed by buffering covered_segments by 8 m, unioning, and measuring intersection with the route
5. Routes are classified into 3 types:
   - **Loop** — different roads each way (blue badge)
   - **Out & Back** — same road, opposite sidewalks (orange badge) — detected when return leg stays within 20 m of outbound leg
   - **One-way** — point-to-point (purple badge)
6. Top 3 results enforce one of each type where available, then fill by freshness
7. User picks a route → opens Google Maps for turn-by-turn navigation

**Two-pin (P2P) mode:**
1. User taps start pin, then taps a second pin for the destination (duration slider hidden)
2. App fetches up to 3 Valhalla route alternates between the two points
3. Routes scored by freshness and returned sorted (freshest first)
4. All routes shown as One-way type

**API:** `POST /api/routes/suggest` — body: `{ startLat, startLng, durationMinutes, userId?, endLat?, endLng? }`

### 3.3 Walk Tracking

1. User taps "Start Walk" — browser requests GPS permission
2. GPS positions recorded via `navigator.geolocation.watchPosition` (min movement: 10 m, accuracy threshold: 150 m to filter coarse network fixes)
3. Walk-in-progress persisted to localStorage — page reloads mid-walk automatically restore tracking
4. Screen Wake Lock (`navigator.wakeLock`) acquired on tracking start; re-acquired on tab resume. Badge shows "☀ screen on" (green) or "⚠ screen off risk" (amber)
5. If tab is hidden for >30 s and Wake Lock was lost, an amber warning banner is shown on resume (GPS gap likely)
6. Live path rendered as orange polyline on the map
7. Timer shows elapsed time; distance computed via haversine formula
8. User taps "Stop Walk" — walk saved to database, coverage map refreshes
9. Summary card shows: distance, duration, new streets count, GPX download link, Discard button
   - Discard deletes the walk and its covered_segments from the database

**States:** `idle → tracking → saving → done`

**API:** `POST /api/walks` — body: `{ userId, coordinates: [lng,lat][], startedAt, completedAt }`

### 3.4 GPX Export

Each completed walk available as a GPX file with interpolated track points derived from the recorded GPS LineString.

**API:** `GET /api/gpx/:walkId`

### 3.5 Map Controls

| Control | Location | Behavior |
|---------|----------|---------|
| Auto-locate | On load | Requests GPS permission; pans to user's location if granted |
| Zoom +/− | Top-left | Standard Leaflet zoom |
| Current location | Top-left (below zoom) | Centers map on GPS position |
| Location search | Top-right | Nominatim geocoding |
| City label | Header | Reverse geocodes map center on pan (1.5 s debounce) |
| Legend | Bottom-right | Color key for road coverage |
| Route planner | Bottom-right | Collapsible FAB panel |
| Walk tracker | Bottom-left | FAB expands to tracking panel |

---

## 4. Technical Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Leaflet, Tailwind CSS v3, vite-plugin-pwa |
| Backend | Node.js 25, Express, TypeScript, postgres.js |
| Database | Supabase (PostgreSQL 15 + PostGIS 3.3), eu-central-2 |
| Routing | Valhalla via Stadia Maps API |
| Tiles | Stadia Maps (alidade_smooth) |
| Hosting — Frontend | Vercel (auto-deploy from GitHub) |
| Hosting — Backend | Railway (auto-deploy from GitHub) |

### Database Schema

**`users`**
```
id UUID PK, email TEXT, city TEXT
```

**`walks`**
```
id UUID PK, user_id UUID FK
geometry GEOMETRY(LineString, 4326)
distance_meters NUMERIC, duration_seconds INT
completed_at TIMESTAMPTZ
```

**`osm_ways`**
```
id BIGINT PK (OSM way ID), name TEXT, highway TEXT
geometry GEOMETRY(LineString, 4326)
```

**`covered_segments`**
```
id UUID PK
user_id UUID FK, walk_id UUID FK, osm_way_id BIGINT FK
side TEXT ('left' | 'right')
geometry GEOMETRY(LineString, 4326)
covered_at TIMESTAMPTZ
UNIQUE (user_id, osm_way_id, side)
```

### Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (verifies PostGIS connection) |
| GET | `/api/roads` | Road segments for bbox + user coverage |
| POST | `/api/routes/suggest` | Generate top-3 fresh route suggestions |
| POST | `/api/walks` | Save completed walk, update coverage |
| DELETE | `/api/walks/:id` | Delete a walk and its covered_segments |
| GET | `/api/gpx/:walkId` | Download GPX for a walk |

### OSM Data

- Road network fetched from Overpass API and stored in `osm_ways`
- Seeded regions: Baar, Zurich, Andover MA, North Andover MA, Bangalore (6 quadrants), Manhattan (3 tiles)
- Total: ~768,000 ways
- Re-seed script: `backend/src/scripts/seed-osm.ts`
- Filter by region: `SEED_AREAS="Bangalore" npx ts-node --transpile-only src/scripts/seed-osm.ts`

---

## 5. MVP Phase Plan

### Phase 1 — Foundation ✅
Database schema, backend scaffold (Express + postgres.js), frontend map shell (React + Leaflet + Tailwind), deployed to Railway + Vercel.

### Phase 2 — Coverage Map ✅
Seeded OSM road network. `/api/roads` endpoint returns GeoJSON color-coded by coverage. Coverage map rendered with canvas renderer, debounced, min zoom 13.

### Phase 3 — Route Suggestion ✅
Valhalla routing via Stadia Maps. 16 candidates (8 triangle loops + 8 one-ways). Loop vs out-and-back classification via geometry analysis. One-of-each-type diversity in top-3. Collapsible RoutePlanner panel. Handoff to Google Maps.

### Phase 4 — Walk Tracking ✅
GPS walk tracking with `watchPosition`. Walk save API matches GPS to OSM ways within 8 m, upserts covered_segments per side. Blue polyline rendered live. Summary card with GPX download.

### Phase 5 — Polish 🔲
UI/UX refinement, performance optimization, mobile experience polish, bug fixes. Launch-ready MVP.

---

## 6. Out of Scope (Post-MVP)

- Strava API integration
- Leaderboard and social features
- Points/gamification system
- Geographic coverage breakdowns (town/county/country stats)
- Personalized pace calibration
- Transit-aware routing (ending near specific tram stops)
- Native iOS/Android app
- **Vector tile rendering:** Replace Leaflet + raster tiles + GeoJSON overlay with MapLibre GL + OpenFreeMap vector tiles. Coverage status would be applied as style filters on the vector tile layer by OSM way ID, eliminating the `/api/roads` GeoJSON endpoint and the need to store full geometries in `osm_ways`. Significant rewrite but would yield GPU-accelerated rendering and a much smaller DB footprint.

---

## 7. Known Constraints and Trade-offs

- **Map matching accuracy:** GPS walks matched to OSM ways using a geometry DWithin pre-filter (0.000120°, ~13 m at 47°N) with a 20 m minimum overlap to filter perpendicular cross-streets. Roads with a mapped parallel footway within 8 m are excluded from road credit (Swiss OSM maps sidewalks as separate footway ways 3–8 m from road centerlines). The GiST index on `osm_ways.geometry` must be used via geometry-type (not geography-type) DWithin — the geography cast causes a full 768K-row scan.
- **Coverage granularity:** Both sides of a way are marked covered when a walk passes within 8 m — actual side detection (left/right based on heading) is not yet implemented; the `side` column stores 'left' and 'right' as duplicates per way.
- **Geolocation on non-HTTPS:** Blocked everywhere except `localhost`. App requires HTTPS in production.
- **Offline support:** OSM tiles cached via PWA service worker. Road segment data requires network.
- **Single user:** No auth. Demo user UUID hardcoded in environment variables. Multi-user requires auth layer.
