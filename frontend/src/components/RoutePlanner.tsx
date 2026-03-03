/**
 * RoutePlanner — floating panel for route suggestion.
 *
 * UI states:
 *  1. Idle: "Plan a Walk" FAB (bottom-right, above API badge)
 *  2. Pin set: panel expands — pin coords, duration input, "Find Routes"
 *  3. Loading: spinner
 *  4. Results: 3 route cards (distance, duration, freshness %, type)
 *  5. Selected: "Open in Google Maps" + "Open in Apple Maps" buttons
 */
import { useState } from 'react'
import { useRouteSuggestion } from '../hooks/useRouteSuggestion'
import type { RouteResult } from '../hooks/useRouteSuggestion'

interface RoutePlannerProps {
  startPin: { lat: number; lng: number } | null
  onClearPin: () => void
  onRouteSelected: (route: RouteResult | null) => void
  userId?: string
  /** Called when the panel opens or closes so the parent can enable map-click pin placement */
  onOpenChange?: (open: boolean) => void
}

function buildGoogleMapsUrl(route: RouteResult): string {
  const coords = route.geometry.coordinates
  const origin = `${coords[0][1]},${coords[0][0]}`
  const destination = `${coords[coords.length - 1][1]},${coords[coords.length - 1][0]}`

  // Sample up to 8 intermediate waypoints
  const step = Math.max(1, Math.floor((coords.length - 2) / 8))
  const waypointCoords = coords.slice(1, -1).filter((_, i) => i % step === 0).slice(0, 8)
  const waypoints = waypointCoords.map(([lng, lat]) => `${lat},${lng}`).join('|')

  const base = 'https://www.google.com/maps/dir/?api=1'
  const params = new URLSearchParams({
    origin,
    destination,
    travelmode: 'walking',
  })
  if (waypoints) params.set('waypoints', waypoints)
  return `${base}&${params.toString()}`
}

function buildAppleMapsUrl(route: RouteResult): string {
  const coords = route.geometry.coordinates
  const [sLng, sLat] = coords[0]
  const [dLng, dLat] = coords[coords.length - 1]
  return `maps://maps.apple.com/?saddr=${sLat},${sLng}&daddr=${dLat},${dLng}&dirflg=w`
}

function TypeBadge({ type }: { type: 'loop' | 'one-way' }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
      type === 'loop'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-purple-100 text-purple-700'
    }`}>
      {type === 'loop' ? 'Loop' : 'One-way'}
    </span>
  )
}

function FreshnessBar({ percent }: { percent: number }) {
  const color = percent >= 80 ? 'bg-green-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-gray-400'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-gray-600 whitespace-nowrap">{percent}% fresh</span>
    </div>
  )
}

export function RoutePlanner({ startPin, onClearPin, onRouteSelected, userId, onOpenChange }: RoutePlannerProps) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [duration, setDuration] = useState(45)
  const { routes, loading, error, selectedIndex, suggestRoutes, selectRoute, clearRoutes } = useRouteSuggestion()

  function handleOpen() {
    setOpen(true)
    onOpenChange?.(true)
  }

  function handleClose() {
    setOpen(false)
    setCollapsed(false)
    onOpenChange?.(false)
    clearRoutes()
    onClearPin()
    onRouteSelected(null)
  }

  function handleFind() {
    if (!startPin) return
    setCollapsed(false)
    onRouteSelected(null)
    suggestRoutes(startPin.lat, startPin.lng, duration, userId)
  }

  function handleSelect(index: number) {
    selectRoute(index)
    onRouteSelected(routes[index])
  }

  // --- FAB (idle, no panel open) ---
  if (!open) {
    return (
      <button
        onClick={handleOpen}
        style={{ zIndex: 1000, bottom: '3.5rem', right: '1rem' }}
        className="absolute flex items-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Plan a Walk
      </button>
    )
  }

  // --- Expanded panel ---
  return (
    <div
      style={{ zIndex: 1000, bottom: '1rem', right: '1rem', maxHeight: 'calc(100vh - 80px)' }}
      className="absolute w-80 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 bg-green-600 text-white">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <span className="font-semibold text-sm">Plan a Walk</span>
          {collapsed && routes.length > 0 && (
            <span className="text-xs bg-white text-green-700 font-semibold px-1.5 py-0.5 rounded-full">
              {routes.length}
            </span>
          )}
          <svg
            className={`w-4 h-4 ml-auto text-green-100 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button onClick={handleClose} className="text-green-100 hover:text-white transition-colors ml-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!collapsed && <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Start pin info */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Start point</p>
          {startPin ? (
            <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
              <span className="text-sm font-mono text-gray-700">
                {startPin.lat.toFixed(5)}, {startPin.lng.toFixed(5)}
              </span>
              <button
                onClick={() => { onClearPin(); clearRoutes(); onRouteSelected(null) }}
                className="text-xs text-red-500 hover:text-red-700 ml-2"
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Tap the map to set a start point</p>
          )}
        </div>

        {/* Duration input */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">
            Duration: <span className="text-green-700 font-semibold">{duration} min</span>
          </label>
          <input
            type="range"
            min={15}
            max={180}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-green-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>15 min</span>
            <span>~{((duration / 60) * 5).toFixed(1)} km</span>
            <span>3 hr</span>
          </div>
        </div>

        {/* Find Routes button — always visible so duration can be changed and re-searched */}
        {!loading && (
          <button
            onClick={handleFind}
            disabled={!startPin}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all
              bg-green-600 text-white hover:bg-green-700 active:scale-95
              disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Find Routes
          </button>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center py-6 gap-3">
            <svg className="animate-spin h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-gray-500">Finding best routes…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
            {error}
            <button onClick={handleFind} className="ml-2 underline text-red-600 text-xs">Retry</button>
          </div>
        )}

        {/* Route cards */}
        {routes.length > 0 && !loading && (
          <>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Top routes</p>
            <div className="space-y-2">
              {routes.map((route, i) => {
                const isSelected = selectedIndex === i
                return (
                  <div
                    key={i}
                    className={`rounded-xl border-2 p-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-green-400 bg-white'
                    }`}
                    onClick={() => handleSelect(i)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <TypeBadge type={route.type} />
                      <span className="text-xs text-gray-500">
                        {route.distanceKm} km · {route.durationMinutes} min
                      </span>
                    </div>
                    <FreshnessBar percent={route.freshnessPercent} />

                    {isSelected && (
                      <div className="mt-3 flex flex-col gap-1.5">
                        <a
                          href={buildGoogleMapsUrl(route)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                          Open in Google Maps
                        </a>
                        <a
                          href={buildAppleMapsUrl(route)}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                          Open in Apple Maps
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

          </>
        )}
      </div>}
    </div>
  )
}
