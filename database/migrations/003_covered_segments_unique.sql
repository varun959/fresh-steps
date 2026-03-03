ALTER TABLE covered_segments
  ADD CONSTRAINT covered_segments_user_way_side_unique
  UNIQUE (user_id, osm_way_id, side);
