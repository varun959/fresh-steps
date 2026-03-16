import { useState, useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { CityLabel } from './components/CityLabel'
import { CoverageMap } from './components/CoverageMap'
import { RoutePlanner } from './components/RoutePlanner'
import { WalkTracker } from './components/WalkTracker'
import { TrackedPathLayer } from './components/TrackedPathLayer'
import { RoutePolyline } from './components/RoutePolyline'
import { LocateControl } from './components/LocateControl'
import { LocationSearch } from './components/LocationSearch'
import { OnboardingCard } from './components/OnboardingCard'
import type { RouteResult } from './hooks/useRouteSuggestion'
import type { RawPosition } from './hooks/useWalkTracking'

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

// Custom end-pin icon (red dot)
const endPinIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  className: '',
})

// Module-level map ref — populated by CaptureMap inside MapContainer.
const mapRef: { current: L.Map | null } = { current: null }

/**
 * Captures the Leaflet map instance into the module-level mapRef.
 * Must be rendered inside <MapContainer>.
 */
function CaptureMap() {
  const map = useMap()
  useEffect(() => { mapRef.current = map }, [map])
  return null
}

/**
 * On mount, requests the user's location and pans the map there.
 * Triggers the browser permission prompt on first visit.
 * Silently falls back to the default center if denied or unavailable.
 */
function AutoLocate({ onLocated }: { onLocated: () => void }) {
  const map = useMap()
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current || !navigator.geolocation) return
    firedRef.current = true
    // Capture the center at mount so we can check if the user panned before GPS resolved
    const initialCenter = map.getCenter()
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // If the user has already panned away, don't snap back
        if (map.distance(map.getCenter(), initialCenter) > 100) return
        map.setView([pos.coords.latitude, pos.coords.longitude], 15)
        onLocated()
      },
      () => { /* denied or unavailable — stay on default center */ },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }, [map, onLocated])
  return null
}

/**
 * Captures map clicks to place/move the start pin.
 * Must be rendered inside <MapContainer>.
 */
/**
 * Shows a semi-transparent accuracy circle around the last raw GPS fix while tracking.
 * Helps visualise GPS drift and signal quality during a walk.
 */
function AccuracyCircle({ position }: { position: RawPosition | null }) {
  const map = useMap()
  const circleRef = useRef<L.Circle | null>(null)

  useEffect(() => {
    if (circleRef.current) { circleRef.current.remove(); circleRef.current = null }
    if (!position) return
    const color = position.accuracy < 20 ? '#16a34a' : position.accuracy < 50 ? '#ca8a04' : '#dc2626'
    circleRef.current = L.circle([position.lat, position.lng], {
      radius: position.accuracy,
      color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 1,
      opacity: 0.4,
    }).addTo(map)
    return () => { circleRef.current?.remove(); circleRef.current = null }
  }, [position, map])

  return null
}

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
  const [endPin, setEndPin] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<RouteResult | null>(null)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [walkCoords, setWalkCoords] = useState<[number, number][]>([])
  const [walkRefreshKey, setWalkRefreshKey] = useState(0)
  const [cityLabel, setCityLabel] = useState('Baar, Switzerland')
  const [located, setLocated] = useState(false)
  const [rawPosition, setRawPosition] = useState<RawPosition | null>(null)

  const handleWalkSaved = useCallback(() => {
    setWalkRefreshKey(k => k + 1)
  }, [])

  function handleMapClick(lat: number, lng: number) {
    if (!plannerOpen) return
    if (!startPin) {
      setStartPin({ lat, lng })
    } else if (!endPin) {
      setEndPin({ lat, lng })
    } else {
      // Both pins set — third tap starts over with a new start pin
      setStartPin({ lat, lng })
      setEndPin(null)
    }
  }

  function handleLocationSelect(lat: number, lng: number) {
    mapRef.current?.setView([lat, lng], 16)
  }

  // Convert selected route GeoJSON coordinates ([lng,lat]) → Leaflet positions ([lat,lng])
  const routePositions: [number, number][] | null = selectedRoute
    ? selectedRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
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
        <span className="text-xs text-green-100">{cityLabel}</span>
      </div>

      {/* Location search — centered below the header */}
      <LocationSearch onSelect={handleLocationSelect} />

      {/* Hint banner — guides user through pin placement */}
      {plannerOpen && !startPin && (
        <div
          style={{ zIndex: 1000, top: '6rem' }}
          className="absolute left-1/2 -translate-x-1/2 mt-2 bg-white text-gray-700 text-xs px-4 py-2 rounded-full shadow-md pointer-events-none"
        >
          Tap the map to set a start point
        </div>
      )}
      {plannerOpen && startPin && !endPin && (
        <div
          style={{ zIndex: 1000, top: '6rem' }}
          className="absolute left-1/2 -translate-x-1/2 mt-2 bg-white text-gray-700 text-xs px-4 py-2 rounded-full shadow-md pointer-events-none"
        >
          Tap to set an end point, or find routes from start
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

        {/* Capture map ref for location search panning */}
        <CaptureMap />

        {/* Pan to user location on first load */}
        <AutoLocate onLocated={() => setLocated(true)} />

        {/* Reverse-geocode map center → city label in header */}
        <CityLabel onCityChange={setCityLabel} />

        <MapClickHandler onMapClick={handleMapClick} />

        {/* Locate-me button (appended to Leaflet top-left control area) */}
        <LocateControl />

        {/* Default welcome marker — only shown if location was not granted and no pin placed */}
        {!startPin && !located && (
          <Marker position={BAAR_CENTER}>
            <Popup>
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

        {/* End pin */}
        {endPin && (
          <Marker position={[endPin.lat, endPin.lng]} icon={endPinIcon}>
            <Popup>End point</Popup>
          </Marker>
        )}

        {/* Selected route polyline — arrows for loops, plain line for one-way */}
        {routePositions && selectedRoute && (
          <RoutePolyline
            positions={routePositions}
            isLoop={selectedRoute.type === 'loop' || selectedRoute.type === 'out-and-back'}
          />
        )}

        {/* Coverage overlay — fetches roads for current viewport */}
        <CoverageMap userId={DEMO_USER_ID} refreshKey={walkRefreshKey} />

        {/* Tracked walk path */}
        {walkCoords.length > 0 && <TrackedPathLayer coords={walkCoords} />}

        {/* Accuracy circle — shows GPS signal quality during tracking */}
        <AccuracyCircle position={rawPosition} />
      </MapContainer>

      {/* Walk Tracker FAB / panel */}
      <WalkTracker
        userId={DEMO_USER_ID}
        onCoordsChange={setWalkCoords}
        onWalkSaved={handleWalkSaved}
        onRawPosition={setRawPosition}
      />

      {/* Route Planner panel / FAB */}
      <RoutePlanner
        startPin={startPin}
        endPin={endPin}
        onClearPin={() => setStartPin(null)}
        onClearEndPin={() => setEndPin(null)}
        onRouteSelected={setSelectedRoute}
        userId={DEMO_USER_ID}
        onOpenChange={setPlannerOpen}
      />

      {/* First-visit onboarding */}
      <OnboardingCard />

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
