/**
 * Classifies a Valhalla-routed loop as a true loop or an out-and-back.
 * Finds the turnaround point (furthest from start), samples 6 points from
 * the second half, and measures their average minimum distance to the first half.
 * Threshold 20m: opposite sidewalk is ~10-15m away; a genuine loop around a
 * city block is typically 40-100m wide.
 */
export function classifyLoopType(coords: [number, number][]): 'loop' | 'out-and-back' {
  if (coords.length < 6) return 'loop';
  const [startLng, startLat] = coords[0];

  // Find the turnaround: the point furthest from start
  let maxDist = 0;
  let turnIdx = Math.floor(coords.length / 2);
  for (let i = 1; i < coords.length - 1; i++) {
    const [lng, lat] = coords[i];
    const dy = (lat - startLat) * 111320;
    const dx = (lng - startLng) * 111320 * Math.cos((startLat * Math.PI) / 180);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxDist) { maxDist = d; turnIdx = i; }
  }

  const firstHalf = coords.slice(0, turnIdx);
  const secondHalf = coords.slice(turnIdx);
  if (firstHalf.length < 2 || secondHalf.length < 2) return 'loop';

  const step = Math.max(1, Math.floor(secondHalf.length / 6));
  const samples = secondHalf.filter((_, i) => i % step === 0).slice(0, 6);

  let totalMinDist = 0;
  for (const [lng2, lat2] of samples) {
    let minDist = Infinity;
    for (const [lng1, lat1] of firstHalf) {
      const dy = (lat2 - lat1) * 111320;
      const dx = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    totalMinDist += minDist;
  }
  return totalMinDist / samples.length < 20 ? 'out-and-back' : 'loop';
}
