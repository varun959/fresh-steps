import { useState, useEffect, useRef, useCallback } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Only fetch roads when zoomed in enough — rendering 2000 segments at zoom < 13
// would be visually useless and slow.
const MIN_ZOOM_FOR_ROADS = 13

export interface RoadsGeoJSON {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

interface GeoJSONFeature {
  type: 'Feature'
  id: number
  geometry: object
  properties: {
    id: number
    name: string | null
    highway: string
    status: 'fresh' | 'partial' | 'covered'
  }
}

interface UseRoadsOptions {
  userId?: string
}

export function useRoads({ userId }: UseRoadsOptions = {}) {
  const [roads, setRoads] = useState<RoadsGeoJSON | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(14)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortController = useRef<AbortController | null>(null)
  const map = useMap()

  const fetchRoads = useCallback((map: LeafletMap) => {
    const z = map.getZoom()
    setZoom(z)

    if (z < MIN_ZOOM_FOR_ROADS) {
      setRoads(null)
      return
    }

    // Cancel any pending debounce or in-flight request
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (abortController.current) abortController.current.abort()

    debounceTimer.current = setTimeout(async () => {
      const bounds = map.getBounds()
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ].map(n => n.toFixed(6)).join(',')

      const params = new URLSearchParams({ bbox })
      if (userId) params.set('userId', userId)

      const controller = new AbortController()
      abortController.current = controller

      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`${API_URL}/api/roads?${params}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: RoadsGeoJSON = await res.json()
        setRoads(data)
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError('Failed to load roads')
        console.error('Roads fetch error:', err)
      } finally {
        setLoading(false)
      }
    }, 300) // 300ms debounce
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Trigger initial load on mount
  useEffect(() => {
    fetchRoads(map)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen to map events
  useMapEvents({
    moveend: (e) => fetchRoads(e.target as LeafletMap),
    zoomend: (e) => fetchRoads(e.target as LeafletMap),
  })


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (abortController.current) abortController.current.abort()
    }
  }, [])

  return { roads, loading, error, zoom, minZoom: MIN_ZOOM_FOR_ROADS }
}
