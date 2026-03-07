import { useState, useRef, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const WALK_STORAGE_KEY = 'fresh-steps-walk-in-progress'

function saveWalkToStorage(coords: [number, number][], startedAt: string) {
  try {
    localStorage.setItem(WALK_STORAGE_KEY, JSON.stringify({ coords, startedAt }))
  } catch {}
}

function clearWalkFromStorage() {
  localStorage.removeItem(WALK_STORAGE_KEY)
}

export type WalkState = 'idle' | 'tracking' | 'saving' | 'done'

export interface WalkSummary {
  walkId: string
  distanceMeters: number
  durationSeconds: number
  coveredWayCount: number
}

function haversineMeters([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function totalDistanceKm(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i])
  }
  return total / 1000
}

export function useWalkTracking(userId?: string) {
  const [state, setState] = useState<WalkState>('idle')
  const [coords, setCoords] = useState<[number, number][]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<WalkSummary | null>(null)

  const coordsRef = useRef<[number, number][]>([])
  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<string | null>(null)

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Shared position handler — used by both startTracking and the restore-on-mount effect
  const handlePosition = useCallback((pos: GeolocationPosition) => {
    if (pos.coords.accuracy > 150) return
    const newCoord: [number, number] = [pos.coords.longitude, pos.coords.latitude]
    const last = coordsRef.current.at(-1)
    if (!last || haversineMeters(last, newCoord) > 10) {
      coordsRef.current = [...coordsRef.current, newCoord]
      setCoords([...coordsRef.current])
      // Persist to localStorage so a page reload can recover the walk
      if (startedAtRef.current) saveWalkToStorage(coordsRef.current, startedAtRef.current)
    }
  }, [])

  const beginWatchAndTimer = useCallback((startMs: number) => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000))
    }, 1000)
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => { setError(`GPS error: ${err.message}`) },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }, [handlePosition])

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser')
      return
    }

    coordsRef.current = []
    setCoords([])
    setElapsedSeconds(0)
    setError(null)
    setSummary(null)
    startedAtRef.current = new Date().toISOString()
    clearWalkFromStorage()
    setState('tracking')
    beginWatchAndTimer(Date.now())
  }, [beginWatchAndTimer])

  // On mount: restore an in-progress walk if the page reloaded mid-walk
  useEffect(() => {
    const saved = localStorage.getItem(WALK_STORAGE_KEY)
    if (!saved) return
    try {
      const { coords: savedCoords, startedAt } = JSON.parse(saved) as {
        coords: [number, number][]
        startedAt: string
      }
      if (savedCoords.length < 2 || !navigator.geolocation) return
      coordsRef.current = savedCoords
      setCoords(savedCoords)
      startedAtRef.current = startedAt
      setState('tracking')
      beginWatchAndTimer(new Date(startedAt).getTime())
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopTracking = useCallback(async () => {
    clearWatch()
    const currentCoords = coordsRef.current
    const startedAt = startedAtRef.current ?? new Date().toISOString()
    const completedAt = new Date().toISOString()

    if (currentCoords.length < 2) {
      setError('Walk too short — need at least 2 GPS points')
      setState('tracking') // keep panel open so error is visible
      return
    }

    setState('saving')
    clearWalkFromStorage()
    try {
      const res = await fetch(`${API_URL}/api/walks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          coordinates: currentCoords,
          startedAt,
          completedAt,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as WalkSummary
      setSummary(data)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save walk')
      setState('tracking') // keep panel open so error is visible
    }
  }, [userId, clearWatch])

  const dismissSummary = useCallback(() => {
    clearWalkFromStorage()
    coordsRef.current = []
    setCoords([])
    setElapsedSeconds(0)
    setError(null)
    setSummary(null)
    setState('idle')
  }, [])

  const discardWalk = useCallback(async (walkId: string) => {
    clearWalkFromStorage()
    await fetch(`${API_URL}/api/walks/${walkId}`, { method: 'DELETE' }).catch(() => {})
    dismissSummary()
  }, [dismissSummary])

  // Cleanup on unmount
  useEffect(() => {
    return clearWatch
  }, [clearWatch])

  const distanceKm = totalDistanceKm(coords)

  return {
    state,
    coords,
    elapsedSeconds,
    distanceKm,
    error,
    summary,
    startTracking,
    stopTracking,
    dismissSummary,
    discardWalk,
  }
}
