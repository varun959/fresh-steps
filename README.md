# Fresh Steps

A mobile walking exploration app that tracks sidewalk coverage and suggests routes that maximize unexplored streets.

Built with Claude Code (agentic development), March 2026.

---

## What It Does

- **Coverage map** — roads color-coded by how much of each sidewalk you've walked (red = fresh, yellow = one side done, green = fully covered)
- **Route suggestions** — enter a duration, get 3 route options ranked by freshness; open in Google Maps for turn-by-turn
- **Walk tracking** — records your GPS path live, saves it to the database, and updates the coverage map when you finish
- **GPX export** — download any walk as a `.gpx` file

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite 7 + Leaflet + Tailwind CSS v3 (PWA) |
| Backend | Node.js 25 + Express + TypeScript + postgres.js |
| Database | Supabase (PostgreSQL + PostGIS 3.3) |
| Routing | Valhalla via Stadia Maps API |
| Hosting | Vercel (frontend) + Railway (backend) |

---

## Local Development

### Prerequisites

- Node.js 20+
- A Supabase project with PostGIS enabled
- A Stadia Maps API key

### Setup

```bash
# Clone
git clone https://github.com/varun959/fresh-steps
cd fresh-steps

# Backend
cd backend
cp .env.example .env  # fill in DATABASE_URL, STADIA_MAPS_API_KEY, DEMO_USER_ID
npm install
npm run dev           # starts on port 3001

# Frontend (separate terminal)
cd frontend
cp .env.example .env.local  # fill in VITE_API_URL, VITE_STADIA_MAPS_API_KEY, VITE_DEMO_USER_ID
npm install
npm run dev           # starts on port 5173
```

### Database

Apply migrations in order:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_osm_ways.sql
psql "$DATABASE_URL" -f database/migrations/003_covered_segments_unique.sql
```

### Seed OSM Road Data

```bash
cd backend

# Seed all configured regions (Baar, Zurich, Bangalore, Manhattan)
DATABASE_URL="..." npx ts-node --transpile-only src/scripts/seed-osm.ts

# Seed a specific region only
DATABASE_URL="..." SEED_AREAS="Bangalore" npx ts-node --transpile-only src/scripts/seed-osm.ts
```

---

## Project Structure

```
fresh-steps/
├── backend/
│   └── src/
│       ├── index.ts              # Express app
│       ├── db.ts                 # postgres.js connection
│       ├── routes/
│       │   ├── roads.ts          # GET /api/roads
│       │   ├── routeSuggestion.ts# POST /api/routes/suggest
│       │   ├── walks.ts          # POST /api/walks
│       │   └── gpxExport.ts      # GET /api/gpx/:walkId
│       ├── lib/
│       │   ├── valhalla.ts       # Stadia Maps routing client
│       │   └── candidates.ts     # 16 candidate route generator
│       └── scripts/
│           └── seed-osm.ts       # Overpass API → osm_ways seeder
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── hooks/
│       │   ├── useRoads.ts       # Debounced road segment fetcher
│       │   ├── useRouteSuggestion.ts
│       │   └── useWalkTracking.ts# GPS tracking state machine
│       └── components/
│           ├── CoverageMap.tsx   # Road rendering (Leaflet canvas)
│           ├── RoutePlanner.tsx  # FAB + route suggestion panel
│           ├── WalkTracker.tsx   # FAB + walk tracking panel
│           ├── TrackedPathLayer.tsx # Live GPS polyline
│           ├── Legend.tsx
│           ├── LocateControl.tsx
│           └── LocationSearch.tsx
└── database/
    └── migrations/
```

---

## Deployment

**Backend → Railway**
1. Connect `varun959/fresh-steps` repo, set root to `/backend`
2. Set env vars: `DATABASE_URL`, `STADIA_MAPS_API_KEY`, `DEMO_USER_ID`
3. Public networking port: match `PORT` env var (Railway sets this to 8080)

**Frontend → Vercel**
1. Connect `varun959/fresh-steps` repo, set root to `/frontend`
2. Set env vars: `VITE_API_URL` (include `https://`), `VITE_STADIA_MAPS_API_KEY`, `VITE_DEMO_USER_ID`

---

## Product Spec

See [`fresh_steps_product_spec.md`](./fresh_steps_product_spec.md) for full feature specification, data model, and phase plan.
