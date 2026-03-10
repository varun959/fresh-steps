import { useState, useRef, useEffect, useCallback } from 'react'
import { haversineMeters, isAccuracyAcceptable, isFarEnough, totalDistanceKm } from '../lib/gps'

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


export interface RawPosition {
  lat: number
  lng: number
  accuracy: number
  accepted: boolean
}

export function useWalkTracking(userId?: string) {
  const [state, setState] = useState<WalkState>('idle')
  const [coords, setCoords] = useState<[number, number][]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<WalkSummary | null>(null)
  const [rawPosition, setRawPosition] = useState<RawPosition | null>(null)
  const [debugLog, setDebugLog] = useState<RawPosition[]>([])
  // True when screen was locked and a GPS gap was detected (Wake Lock unavailable/released)
  const [screenLockWarning, setScreenLockWarning] = useState(false)
  // True while the Screen Wake Lock sentinel is held (screen won't auto-sleep)
  const [wakeLockActive, setWakeLockActive] = useState(false)

  const coordsRef = useRef<[number, number][]>([])
  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<string | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  // Timestamp of last accepted GPS fix — used to detect gaps when screen unlocks
  const lastPositionTimeRef = useRef<number | null>(null)

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    // Release screen wake lock when tracking stops
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
    setWakeLockActive(false)
  }, [])

  // Shared position handler — used by both startTracking and the restore-on-mount effect
  const handlePosition = useCallback((pos: GeolocationPosition) => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords
    const accepted = isAccuracyAcceptable(accuracy)
    const raw: RawPosition = { lat, lng, accuracy, accepted }
    setRawPosition(raw)
    setDebugLog(log => [...log.slice(-49), raw]) // keep last 50 entries

    if (!accepted) return
    lastPositionTimeRef.current = Date.now()
    const newCoord: [number, number] = [lng, lat]
    const last = coordsRef.current.at(-1)
    if (isFarEnough(newCoord, last)) {
      coordsRef.current = [...coordsRef.current, newCoord]
      setCoords([...coordsRef.current])
      // Persist to localStorage so a page reload can recover the walk
      if (startedAtRef.current) saveWalkToStorage(coordsRef.current, startedAtRef.current)
    }
  }, [])

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      wakeLockRef.current = sentinel
      setWakeLockActive(true)
      // OS can revoke the lock (e.g. battery saver kicks in) — update indicator immediately
      sentinel.addEventListener('release', () => setWakeLockActive(false), { once: true })
    } catch {
      // Wake Lock denied (e.g. battery saver mode) — screen may still lock, warning will fire
      setWakeLockActive(false)
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
    void acquireWakeLock()
  }, [handlePosition, acquireWakeLock])

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

  // Page Visibility API: while tracking, re-acquire Wake Lock after screen unlock
  // and warn the user if GPS was paused (gap > 30s, meaning Wake Lock wasn't available)
  useEffect(() => {
    if (state !== 'tracking') return
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // Re-acquire wake lock — it's automatically released when the tab goes hidden
      void acquireWakeLock()
      // If it's been > 30s since the last GPS fix, screen was locked without Wake Lock
      const lastTime = lastPositionTimeRef.current
      if (lastTime !== null && Date.now() - lastTime > 30_000) {
        setScreenLockWarning(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [state, acquireWakeLock])

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
    setScreenLockWarning(false)
    setState('idle')
  }, [])

  const dismissScreenLockWarning = useCallback(() => setScreenLockWarning(false), [])

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
    rawPosition,
    debugLog,
    screenLockWarning,
    wakeLockActive,
    startTracking,
    stopTracking,
    dismissSummary,
    dismissScreenLockWarning,
    discardWalk,
  }
}
