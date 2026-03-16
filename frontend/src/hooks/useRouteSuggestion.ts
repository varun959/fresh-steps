import { useState, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface RouteResult {
  type: 'loop' | 'one-way' | 'out-and-back'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distanceKm: number
  durationMinutes: number
  freshnessPercent: number
}

interface UseRouteSuggestionReturn {
  routes: RouteResult[]
  loading: boolean
  error: string | null
  selectedIndex: number | null
  suggestRoutes: (startLat: number, startLng: number, durationMinutes: number, userId?: string, endLat?: number, endLng?: number) => Promise<void>
  selectRoute: (index: number) => void
  clearRoutes: () => void
}

export function useRouteSuggestion(): UseRouteSuggestionReturn {
  const [routes, setRoutes] = useState<RouteResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const suggestRoutes = useCallback(async (
    startLat: number,
    startLng: number,
    durationMinutes: number,
    userId?: string,
    endLat?: number,
    endLng?: number,
  ) => {
    setLoading(true)
    setError(null)
    setRoutes([])
    setSelectedIndex(null)

    try {
      const response = await fetch(`${BACKEND_URL}/api/routes/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startLat, startLng, durationMinutes, userId, endLat, endLng }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`)
      }

      const data = await response.json() as { routes: RouteResult[] }
      setRoutes(data.routes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  const selectRoute = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  const clearRoutes = useCallback(() => {
    setRoutes([])
    setError(null)
    setSelectedIndex(null)
  }, [])

  return { routes, loading, error, selectedIndex, suggestRoutes, selectRoute, clearRoutes }
}
