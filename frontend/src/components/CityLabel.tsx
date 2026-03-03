/**
 * Reverse-geocodes the map center on moveend (debounced 1.5 s) via Nominatim
 * and calls onCityChange with a "City, Country" string.
 * Must be rendered inside <MapContainer>.
 */
import { useEffect, useRef } from 'react'
import { useMapEvents } from 'react-leaflet'

interface CityLabelProps {
  onCityChange: (label: string) => void
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) return null
  const data = await res.json() as {
    address: {
      city?: string
      town?: string
      village?: string
      municipality?: string
      county?: string
      country?: string
    }
  }
  const place =
    data.address.city ??
    data.address.town ??
    data.address.village ??
    data.address.municipality ??
    data.address.county ??
    null
  const country = data.address.country ?? null
  if (!place) return null
  return country ? `${place}, ${country}` : place
}

export function CityLabel({ onCityChange }: CityLabelProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const map = useMapEvents({
    moveend() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        const { lat, lng } = map.getCenter()
        const label = await reverseGeocode(lat, lng).catch(() => null)
        if (label) onCityChange(label)
      }, 1500)
    },
  })

  // Reverse geocode the initial center once on mount
  useEffect(() => {
    const { lat, lng } = map.getCenter()
    reverseGeocode(lat, lng)
      .then(label => { if (label) onCityChange(label) })
      .catch(() => null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
