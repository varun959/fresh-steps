/**
 * CoverageMap — renders inside <MapContainer>.
 *
 * Calls useRoads once to fetch road GeoJSON for the current viewport,
 * renders them as color-coded polylines via Leaflet Canvas, and shows
 * the Legend. Both components share the same road-fetch state.
 */
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useRoads, type RoadsGeoJSON } from '../hooks/useRoads'
import { Legend } from './Legend'

const STATUS_COLOR: Record<string, string> = {
  fresh:   '#dc2626', // red-600
  partial: '#ca8a04', // yellow-600
  covered: '#16a34a', // green-600
}

function roadWeight(highway: string): number {
  switch (highway) {
    case 'primary': case 'primary_link':
    case 'secondary': case 'secondary_link':
      return 3
    case 'tertiary': case 'tertiary_link':
    case 'residential': case 'unclassified': case 'living_street':
      return 2.5
    default:
      return 1.5
  }
}

function RoadsLayer({ roads, zoom, minZoom, showFresh }: {
  roads: RoadsGeoJSON | null
  zoom: number
  minZoom: number
  showFresh: boolean
}) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!roads || zoom < minZoom) return


    const visibleRoads = showFresh
      ? roads
      : { ...roads, features: roads.features.filter(f => f.properties?.status !== 'fresh') }

    const renderer = L.canvas({ padding: 0.5 })

    // `renderer` is valid at runtime but missing from Leaflet's GeoJSONOptions TS types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoJsonOptions: any = {
      renderer,
      style: (feature: GeoJSON.Feature) => ({
        color: STATUS_COLOR[(feature?.properties?.status as string) ?? 'fresh'] ?? STATUS_COLOR.fresh,
        weight: roadWeight((feature?.properties?.highway as string) ?? 'residential'),
        opacity: 0.85,
      }),
      onEachFeature: (feature: GeoJSON.Feature, fl: L.Layer) => {
        const { name, highway, status } = (feature.properties ?? {}) as Record<string, string>
        if (name || highway) {
          (fl as L.Path).bindTooltip(
            `<strong>${name ?? highway}</strong> <span style="color:#888">${status}</span>`,
            { sticky: true }
          )
        }
      },
    }

    const layer = L.geoJSON(visibleRoads as unknown as GeoJSON.FeatureCollection, geoJsonOptions)
    layer.addTo(map)
    layerRef.current = layer
    return () => { layer.remove() }
  }, [roads, map, zoom, minZoom, showFresh])

  return null
}

interface CoverageMapProps {
  userId?: string
  refreshKey?: number
}

export function CoverageMap({ userId, refreshKey }: CoverageMapProps) {
  const { roads, loading, error, zoom, minZoom } = useRoads({ userId, refreshKey })
  const [showFresh, setShowFresh] = useState(true)

  return (
    <>
      <RoadsLayer roads={roads} zoom={zoom} minZoom={minZoom} showFresh={showFresh} />
      <Legend
        loading={loading}
        zoom={zoom}
        minZoom={minZoom}
        roadCount={roads?.features.length ?? 0}
        showFresh={showFresh}
        onToggleFresh={() => setShowFresh(v => !v)}
      />
      {error && (
        <div
          style={{ zIndex: 1100 }}
          className="absolute top-14 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 text-xs px-3 py-1 rounded-full shadow pointer-events-none"
        >
          {error}
        </div>
      )}
    </>
  )
}
