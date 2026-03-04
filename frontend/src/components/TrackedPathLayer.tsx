import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface TrackedPathLayerProps {
  coords: [number, number][] // [lng, lat]
}

export function TrackedPathLayer({ coords }: TrackedPathLayerProps) {
  const map = useMap()
  const polylineRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    // Remove previous layer
    if (polylineRef.current) {
      polylineRef.current.remove()
      polylineRef.current = null
    }
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    if (coords.length === 0) return

    // Convert [lng, lat] → [lat, lng] for Leaflet
    const positions: [number, number][] = coords.map(([lng, lat]) => [lat, lng])

    polylineRef.current = L.polyline(positions, {
      color: '#2563eb',
      weight: 4,
      opacity: 0.9,
    }).addTo(map)

    const last = positions[positions.length - 1]
    markerRef.current = L.circleMarker(last, {
      radius: 8,
      color: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map)

    return () => {
      polylineRef.current?.remove()
      markerRef.current?.remove()
    }
  }, [coords, map])

  return null
}
