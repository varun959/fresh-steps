-- OSM road network table
-- Stores walkable ways fetched from OpenStreetMap via Overpass API
CREATE TABLE IF NOT EXISTS osm_ways (
  id BIGINT PRIMARY KEY,          -- OSM way ID
  name TEXT,                       -- Road name (may be null for unnamed paths)
  highway TEXT NOT NULL,           -- OSM highway tag (residential, footway, etc.)
  geometry GEOMETRY(LineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS osm_ways_geometry_idx ON osm_ways USING GIST(geometry);
CREATE INDEX IF NOT EXISTS osm_ways_highway_idx ON osm_ways(highway);
