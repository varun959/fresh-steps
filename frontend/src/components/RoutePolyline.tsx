import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface RoutePolylineProps {
  positions: [number, number][] // [lat, lng]
  isLoop: boolean
}

/** Bearing in degrees (clockwise from north) between two [lat, lng] points. */
function bearingDeg(from: [number, number], to: [number, number]): number {
  const φ1 = (from[0] * Math.PI) / 180
  const φ2 = (to[0] * Math.PI) / 180
  const Δλ = ((to[1] - from[1]) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

function arrowIcon(deg: number): L.DivIcon {
  return L.divIcon({
    html: `<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <polygon points="7,1 13,13 7,9.5 1,13" fill="#2563eb" opacity="0.9"
        transform="rotate(${deg},7,7)"/>
    </svg>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

export function RoutePolyline({ positions, isLoop }: RoutePolylineProps) {
  const map = useMap()

  useEffect(() => {
    if (positions.length < 2) return

    const polyline = L.polyline(positions, {
      color: '#2563eb',
      weight: 5,
      opacity: 0.8,
    }).addTo(map)

    const arrows: L.Marker[] = []
    if (isLoop) {
      const n = positions.length
      const step = Math.max(1, Math.floor(n / 8))
      for (let i = step; i < n - step; i += step) {
        const lookAhead = Math.min(i + 4, n - 1)
        const deg = bearingDeg(positions[i], positions[lookAhead])
        arrows.push(
          L.marker(positions[i], { icon: arrowIcon(deg), interactive: false }).addTo(map)
        )
      }
    }

    return () => {
      polyline.remove()
      arrows.forEach(m => m.remove())
    }
  }, [positions, isLoop, map])

  return null
}
