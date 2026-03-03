import { useEffect } from 'react'
import { useWalkTracking } from '../hooks/useWalkTracking'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

interface WalkTrackerProps {
  userId?: string
  onCoordsChange: (coords: [number, number][]) => void
  onWalkSaved: () => void
}

export function WalkTracker({ userId, onCoordsChange, onWalkSaved }: WalkTrackerProps) {
  const {
    state,
    coords,
    elapsedSeconds,
    distanceKm,
    error,
    summary,
    startTracking,
    stopTracking,
    dismissSummary,
  } = useWalkTracking(userId)

  useEffect(() => {
    onCoordsChange(coords)
  }, [coords, onCoordsChange])

  useEffect(() => {
    if (state === 'done') onWalkSaved()
  }, [state, onWalkSaved])

  if (state === 'idle') {
    return (
      <button
        onClick={startTracking}
        style={{ zIndex: 1000, bottom: '10rem', left: '1rem' }}
        className="absolute flex items-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-sm px-4 py-3 rounded-full shadow-lg transition-colors"
        aria-label="Start Walk"
      >
        <span>🦶</span>
        Start Walk
      </button>
    )
  }

  if (state === 'tracking') {
    return (
      <div
        style={{ zIndex: 1000, bottom: '1rem', left: '1rem' }}
        className="absolute bg-white rounded-2xl shadow-xl p-4 w-56"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-sm font-semibold text-gray-800">Recording…</span>
        </div>

        <div className="text-3xl font-mono font-bold text-gray-900 mb-1">
          {formatTime(elapsedSeconds)}
        </div>
        <div className="text-sm text-gray-500 mb-1">{distanceKm.toFixed(2)} km</div>
        <div className="text-xs text-gray-400 mb-3">{coords.length} GPS points</div>

        {error && (
          <div className="text-xs text-red-600 mb-2">{error}</div>
        )}

        <button
          onClick={stopTracking}
          className="w-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold text-sm py-2 rounded-xl transition-colors"
        >
          Stop Walk
        </button>
      </div>
    )
  }

  if (state === 'saving') {
    return (
      <div
        style={{ zIndex: 1000, bottom: '1rem', left: '1rem' }}
        className="absolute bg-white rounded-2xl shadow-xl p-4 w-56 flex items-center gap-3"
      >
        <svg className="animate-spin h-5 w-5 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm text-gray-700 font-medium">Saving walk…</span>
      </div>
    )
  }

  // state === 'done'
  if (!summary) return null

  const distKm = (summary.distanceMeters / 1000).toFixed(2)
  const durMin = Math.round(summary.durationSeconds / 60)

  return (
    <div
      style={{ zIndex: 1000, bottom: '1rem', left: '1rem' }}
      className="absolute bg-white rounded-2xl shadow-xl p-4 w-64"
    >
      <div className="text-base font-bold text-gray-900 mb-3">Walk saved!</div>

      <div className="space-y-1 text-sm text-gray-600 mb-3">
        <div>Distance: <span className="font-semibold text-gray-900">{distKm} km</span></div>
        <div>Duration: <span className="font-semibold text-gray-900">{durMin} min</span></div>
        <div>Streets covered: <span className="font-semibold text-gray-900">{summary.coveredWayCount}</span></div>
      </div>

      <a
        href={`${BACKEND_URL}/api/gpx/${summary.walkId}`}
        download={`walk-${summary.walkId}.gpx`}
        className="block w-full text-center bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium py-2 rounded-xl mb-2 transition-colors"
      >
        Download GPX
      </a>

      <button
        onClick={dismissSummary}
        className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-sm py-2 rounded-xl transition-colors"
      >
        Done
      </button>
    </div>
  )
}
