/** Haversine distance in metres between two [lng, lat] points. */
export function haversineMeters([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Returns true if a GPS reading should be accepted based on accuracy. */
export function isAccuracyAcceptable(accuracy: number): boolean {
  return accuracy <= 150
}

/** Returns true if a new coord is far enough from the last to be recorded. */
export function isFarEnough(newCoord: [number, number], lastCoord: [number, number] | undefined): boolean {
  if (!lastCoord) return true
  return haversineMeters(lastCoord, newCoord) > 10
}

export function totalDistanceKm(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i])
  }
  return total / 1000
}
