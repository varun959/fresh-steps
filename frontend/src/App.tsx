import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { CoverageMap } from './components/CoverageMap'
import { RoutePlanner } from './components/RoutePlanner'
import type { RouteResult } from './hooks/useRouteSuggestion'

// Fix Leaflet default marker icon broken by bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Baar, Switzerland
const BAAR_CENTER: [number, number] = [47.196, 8.5307]
const DEFAULT_ZOOM = 14

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STADIA_KEY = import.meta.env.VITE_STADIA_MAPS_API_KEY as string | undefined
const DEMO_USER_ID = import.meta.env.VITE_DEMO_USER_ID as string | undefined

// Custom start-pin icon (green dot)
const startPinIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  className: '',
})

/**
 * Captures map clicks to place/move the start pin.
 * Must be rendered inside <MapContainer>.
 */
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function App() {
  const [startPin, setStartPin] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<RouteResult | null>(null)
  const [plannerOpen, setPlannerOpen] = useState(false)

  function handleMapClick(lat: number, lng: number) {
    // Only place a pin while the planner panel is open
    if (plannerOpen) {
      setStartPin({ lat, lng })
    }
  }

  // Convert selected route GeoJSON coordinates ([lng,lat]) → Leaflet positions ([lat,lng])
  const routePositions: [number, number][] | null = selectedRoute
    ? selectedRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng])
    : null

  // Build tile URL — use Stadia if key is available, otherwise fall back to OSM
  const tileUrl = STADIA_KEY
    ? `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const tileAttribution = STADIA_KEY
    ? '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

  return (
    <div className="relative h-full w-full">
      {/* Header */}
      <div
        style={{ zIndex: 1000 }}
        className="absolute top-0 left-0 right-0 bg-green-600 text-white px-4 py-2 flex items-center justify-between shadow-md"
      >
        <span className="font-bold text-lg tracking-tight">Fresh Steps 🥾</span>
        <span className="text-xs text-green-100">Baar, Switzerland</span>
      </div>

      {/* Hint banner when planner is open and no pin placed yet */}
      {plannerOpen && !startPin && (
        <div
          style={{ zIndex: 1000, top: '3rem' }}
          className="absolute left-1/2 -translate-x-1/2 mt-2 bg-white text-gray-700 text-xs px-4 py-2 rounded-full shadow-md pointer-events-none"
        >
          Tap the map to set a start point
        </div>
      )}

      {/* Full-screen Leaflet map */}
      <MapContainer
        center={BAAR_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
          maxZoom={20}
        />

        <MapClickHandler onMapClick={handleMapClick} />

        {/* Default welcome marker — hidden when a start pin is placed */}
        {!startPin && (
          <Marker position={BAAR_CENTER}>
            <Popup>
              <strong>Baar, Switzerland</strong>
              <br />
              Open "Plan a Walk" then tap the map to start!
            </Popup>
          </Marker>
        )}

        {/* Start pin */}
        {startPin && (
          <Marker position={[startPin.lat, startPin.lng]} icon={startPinIcon}>
            <Popup>Start point</Popup>
          </Marker>
        )}

        {/* Selected route polyline */}
        {routePositions && (
          <Polyline
            positions={routePositions}
            color="#2563eb"
            weight={5}
            opacity={0.8}
          />
        )}

        {/* Coverage overlay — fetches roads for current viewport */}
        <CoverageMap userId={DEMO_USER_ID} />
      </MapContainer>

      {/* Route Planner panel / FAB */}
      <RoutePlanner
        startPin={startPin}
        onClearPin={() => setStartPin(null)}
        onRouteSelected={setSelectedRoute}
        userId={DEMO_USER_ID}
        onOpenChange={setPlannerOpen}
      />

      {/* API health badge */}
      <a
        href={`${BACKEND_URL}/health`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ zIndex: 999, bottom: '1rem', right: '1rem' }}
        className="absolute inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1 text-xs font-medium shadow text-gray-600 hover:shadow-md transition-shadow"
      >
        <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
        API
      </a>
    </div>
  )
}

export default App
