import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

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

function App() {
  return (
    <div className="relative h-full w-full">
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-green-600 text-white px-4 py-2 flex items-center justify-between shadow-md">
        <span className="font-bold text-lg tracking-tight">Fresh Steps 🥾</span>
        <span className="text-xs text-green-100">Baar, Switzerland</span>
      </div>

      {/* Full-screen Leaflet map */}
      <MapContainer
        center={BAAR_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Marker position={BAAR_CENTER}>
          <Popup>
            <strong>Baar, Switzerland</strong>
            <br />
            Start exploring fresh streets!
          </Popup>
        </Marker>
      </MapContainer>

      {/* API health badge */}
      <div className="absolute bottom-4 right-4 z-[1000]">
        <a
          href={`${BACKEND_URL}/health`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1 text-xs font-medium shadow text-gray-600 hover:shadow-md transition-shadow"
        >
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
          API
        </a>
      </div>
    </div>
  )
}

export default App
