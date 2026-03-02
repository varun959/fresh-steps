interface LegendProps {
  loading: boolean
  zoom: number
  minZoom: number
  roadCount: number
}

export function Legend({ loading, zoom, minZoom, roadCount }: LegendProps) {
  return (
    <div
      style={{ zIndex: 1000, pointerEvents: 'none' }}
      className="absolute bottom-8 left-4 bg-white rounded-xl shadow-md px-3 py-2 text-xs text-gray-700 space-y-1 min-w-[130px]"
    >
      <div className="font-semibold text-gray-800 mb-1">Coverage</div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: '#16a34a' }} />
        Fresh
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: '#ca8a04' }} />
        One side done
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: '#6b7280' }} />
        Covered
      </div>

      <div className="pt-1 border-t border-gray-100 text-gray-400">
        {zoom < minZoom
          ? 'Zoom in to see roads'
          : loading
          ? <span className="animate-pulse">Loading…</span>
          : `${roadCount} segments`}
      </div>
    </div>
  )
}
