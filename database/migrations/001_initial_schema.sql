-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Walks table
CREATE TABLE IF NOT EXISTS walks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  geometry GEOMETRY(LineString, 4326),
  distance_meters FLOAT,
  duration_seconds INTEGER,
  gpx_file_path TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS walks_user_id_idx ON walks(user_id);
CREATE INDEX IF NOT EXISTS walks_geometry_idx ON walks USING GIST(geometry);

-- Covered segments table
-- Each row represents one side (left/right) of a road segment actually walked
CREATE TABLE IF NOT EXISTS covered_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  walk_id UUID REFERENCES walks(id) ON DELETE SET NULL,
  osm_way_id BIGINT,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  geometry GEOMETRY(LineString, 4326) NOT NULL,
  covered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS covered_segments_user_id_idx ON covered_segments(user_id);
CREATE INDEX IF NOT EXISTS covered_segments_osm_way_id_idx ON covered_segments(osm_way_id);
CREATE INDEX IF NOT EXISTS covered_segments_geometry_idx ON covered_segments USING GIST(geometry);
