# Fresh Steps - Complete Project Guide
## Gamified Walking Exploration App

**Last Updated:** March 2, 2026  
**Project Status:** In Development  
**Builder:** Claude Code (agentic)

---

## 📋 Executive Summary

### What This Project Is
Fresh Steps is a mobile walking app that rewards users for exploring new streets. It combines coverage tracking, route suggestion, and real-time GPS into a single mobile experience — replacing the manual workflow of stitching together wandrer.earth, ridewithgps, and Strava.

### Pilot User Context
The first user lives in Baar (Zug) and works in Zurich — they use the app in both areas. They are an avid cyclist recovering from an injury and walking in the interim. They want to maximize exploration of fresh (unwalked) roads wherever they are. In Baar, they drive to a starting location to reduce overlap with already-covered roads. In Zurich, they take public transit to the starting point. In both cities, the well-connected transit network makes one-way routes (ending at a tram/bus stop) equally appealing as loops.

### Key Design Decisions
- **Route suggestions, not user-planned routes** — app suggests routes from a chosen start, user picks one
- **Time-based input, not distance** — "I have 45 minutes" is more natural than "I want 4km"
- **~5km/h assumed walking speed** for time-to-distance conversion (can be personalized post-MVP)
- **Google/Apple Maps for navigation** — Fresh Steps handles planning and tracking; turn-by-turn is delegated
- **No Strava API for MVP** — walks are saved as GPX files on device, with option to export, for manual import if desired

---

## 🎯 MVP Scope

### In Scope

**1. Coverage Map**
- Roads color-coded by sidewalk coverage:
  - 🟢 Green — both sides fresh (unwalked)
  - 🟡 Yellow — one side covered, one side still fresh
  - ⬛ Gray — both sides covered
  - 🔵 Blue — planned route (selected, not yet walked)
  - 🟠 Orange — walked in current session (turns gray on completion)
  - 📍 Pulsing blue dot — live position during walk
- Coverage is tracked per sidewalk side (left/right), not per road — walking one side leaves the other side fresh
- Only the portion of sidewalk actually walked is marked covered (not the full OSM segment)
- Persisted across sessions — full walk history always visible

**2. Route Suggestion**
- Drop a pin to set start location (planned from desk, not necessarily current location)
- Enter desired walk duration
- App suggests routes maximizing fresh sidewalk coverage, across three types:
  - 🔄 **Loop** — returns to start via different roads
  - ➡️ **One-way** — ends somewhere else (e.g. transit stop)
  - 🔁 **Out & Back** — same road both ways, opposite sidewalks; efficient for car-parked exploration
- Each route shows: estimated distance, duration, freshness %
- Coverage recording only begins when a walk is explicitly started — GPS during transit or driving does not mark roads as covered

**3. Navigation Handoff**
- Export selected route to Google Maps or Apple Maps
- Fresh Steps handles planning; native maps handle turn-by-turn

**4. Real-Time Walk Tracking**
- Live GPS position shown on coverage map during walk
- Confirms you're not doubling back on covered roads
- Coverage map updates in real-time as you walk

**5. GPX Export**
- Each completed walk saved as a GPX file
- User can export the file to share or import into Strava or any compatible app

### Out of Scope (Post-MVP)
- Strava API integration (import/export)
- Leaderboard and social features
- Points and gamification
- Geographic coverage breakdowns (town/county/country stats)
- Personalized pace calibration
- Transit-aware routing (ending near specific tram stops)

---

## 🏗️ Architecture Overview

### Technology Stack

**Frontend (PWA):**
- React 18+ with Vite
- Leaflet.js for interactive maps
- Tailwind CSS for styling
- React Query for data fetching
- Service Workers for offline support

**Backend:**
- Node.js 20+ with Express
- TypeScript
- postgres.js (raw PostgreSQL client)

**Database:**
- Supabase (hosted PostgreSQL + PostGIS, free tier)

**Hosting:**
- Backend: Railway or Render (deploys from GitHub, free tier)
- Frontend: Vercel (deploys from GitHub, free tier, CDN-served)

**Routing Engine:**
- Valhalla (open-source routing engine)
- OpenStreetMap data for road network

**External Services:**
- OpenStreetMap tiles for map display
- Google Maps / Apple Maps (navigation handoff only)

### System Architecture (4 Layers)

```
┌─────────────────────────────────┐
│    Client (PWA)                 │
│  - Coverage Map                 │
│  - Route Suggester              │
│  - GPS Tracking                 │
│  Hosted on: Vercel              │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│    API Layer (Express)          │
│  - Route Suggestion Service     │
│  - Coverage Service             │
│  - GPX Export                   │
│  Hosted on: Railway / Render    │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│    External Services            │
│  - Valhalla (routing)           │
│  - OpenStreetMap                │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│    Data Layer                   │
│  - Supabase (PostgreSQL +       │
│    PostGIS, hosted)             │
└─────────────────────────────────┘
```

### Data Models

**User**
- id, email, username, city

**CoveredSegment**
- id, userId, osmWayId
- side (`left` or `right`) — tracked independently per sidewalk
- geometry (LineString) — actual portion walked, not the full OSM way
- coveredAt timestamp

**Walk**
- id, userId
- geometry (LineString)
- distance, duration
- gpxFilePath
- completedAt

---

## 📅 MVP Phases

### Phase 1: Foundation
- Create Supabase project, enable PostGIS, create schema
- Initialize monorepo on GitHub (frontend + backend)
- Backend: Node.js + Express + TypeScript, connected to Supabase
- Frontend: React 18 + Vite PWA shell, Leaflet map centered on Baar
- Deploy backend to Railway/Render, frontend to Vercel (both auto-deploy from GitHub)

**Deliverable:** Empty app deployed and accessible on mobile — map loads, database connects

---

### Phase 2: Coverage Map
- Seed OSM road network for Zurich
- Render roads on Leaflet map
- Store and display covered segments
- Color-code fresh vs. covered roads

**Deliverable:** Coverage map visible, persisted across sessions

---

### Phase 3: Route Suggestion
- Valhalla setup + OSM import
- Route suggestion algorithm (maximize freshness, loops + one-way)
- Duration input → distance conversion at ~5km/h
- Route selector UI (show options with distance, duration, freshness %)
- Export selected route to Google/Apple Maps

**Deliverable:** Drop a pin, enter duration, get route suggestions, navigate with Maps

---

### Phase 4: Walk Tracking
- Real-time GPS tracking during walk
- Live position on coverage map
- Coverage updates as you walk
- Walk completion detection
- GPX file saved to device

**Deliverable:** Walk a route, see coverage update live, export GPX

---

### Phase 5: Polish
- UI/UX refinement
- Performance optimization
- Bug fixes
- Mobile experience polish

**Deliverable:** Launch-ready MVP

---

## 🔑 Key Technical Decisions

### Why Route Suggestion over Destination-Based?
The pilot user wants the app to do the thinking. Rather than tapping a destination and getting routes to it, the app suggests where to go — maximizing fresh roads from a chosen start point. This matches the "planning from desk" use case.

### Why Time Input over Distance?
"I have 45 minutes" is a more natural decision than "I want 3.8km." Speed is assumed at ~5km/h for MVP, personalized later.

### Why Google/Apple Maps for Navigation?
Building turn-by-turn navigation is significant scope. Delegating to native maps means Fresh Steps focuses on what it does uniquely: coverage tracking and fresh route suggestion.

### Why GPX over Strava API?
The pilot user's Strava history is mostly cycling in Massachusetts — not useful for seeding Zurich coverage. GPX export gives portability without API complexity. Strava API integration is a natural post-MVP addition.

### Why Valhalla?
- Open source routing engine
- Supports custom edge weights (for freshness optimization)
- Self-hostable (no API costs)
- Designed for pedestrian routing

### Why postgres.js over an ORM?
PostGIS spatial queries — `ST_Intersects`, `ST_Intersection`, `ST_Length` — are the core of this app. An ORM like Prisma doesn't understand PostGIS types, which means you'd end up writing raw SQL for all the interesting logic anyway. Using postgres.js throughout keeps one consistent pattern, gives PostGIS first-class treatment, and removes an abstraction layer Claude Code doesn't need.

### Why PWA instead of Native?
- Faster to build (one codebase)
- Works on all devices
- Can be "installed" on home screen
- Good enough for MVP
- Can build native later if needed

---

## 📊 Success Metrics

### MVP Launch Criteria
- ✅ Coverage map loads and persists correctly
- ✅ User can drop a pin and enter walk duration
- ✅ App suggests fresh routes (loops and one-way)
- ✅ Route exports correctly to Google/Apple Maps
- ✅ Real-time GPS tracking works on mobile
- ✅ Coverage map updates live during walk
- ✅ GPX file saved after walk completion
- ✅ No critical bugs on mobile

---

## 🎓 Core Concepts

### PostGIS Spatial Queries
- `ST_Intersects(geometry1, geometry2)` - Do shapes overlap?
- `ST_Intersection(geometry1, geometry2)` - Where do they overlap?
- `ST_Length(geometry::geography)` - How long is this line?
- `GIST indexes` - Make spatial queries fast
- All queries written in raw SQL via postgres.js

### Route Freshness Calculation
```
1. Take generated route (LineString)
2. Query ALL historical CoveredSegments for this user that intersect the route
   — freshness is always calculated against complete walk history, not just recent walks
3. For each intersecting segment, check side (left/right) against the route direction
4. Calculate overlap length using ST_Intersection on actual walked geometries
5. Freshness = (total sidewalk length - covered sidewalk length) / total * 100
```

### Valhalla Routing
```
1. Send start coordinates + costing options + max distance
2. Valhalla returns encoded polyline
3. Decode to GeoJSON coordinates
4. Display on map
```

### Map Matching
```
1. GPS track from walk (raw points)
2. Valhalla "snaps" points to nearest roads
3. Determines which side of the road was walked (left/right) based on direction of travel
4. Stores only the actual portion walked as a LineString (partial segment support)
5. Coverage recording only active during an explicit walk session
```

---

## 💡 Key Context

- **Started:** March 2, 2026 in Zurich
- **Pilot user:** Cyclist recovering from injury, walking in the interim
- **Reference apps:** wandrer.earth (coverage tracking) + ridewithgps (planning) + Strava (tracking) — Fresh Steps replaces all three on mobile
- **Target cities:** Baar (Zug) and Zurich (expandable to other cities later)
- **Building with:** Claude Code (agentic development)
