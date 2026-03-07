interface LegendProps {
  loading: boolean
  zoom: number
  minZoom: number
  roadCount: number
  showFresh: boolean
  onToggleFresh: () => void
}

export function Legend({ loading, zoom, minZoom, roadCount, showFresh, onToggleFresh }: LegendProps) {
  return (
    <div
      style={{ zIndex: 1000 }}
      className="absolute bottom-8 left-4 bg-white rounded-xl shadow-md px-3 py-2 text-xs text-gray-700 space-y-1 min-w-[130px]"
    >
      <div className="font-semibold text-gray-800 mb-1">Coverage</div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: '#dc2626' }} />
        Not walked
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: '#ca8a04' }} />
        One side done
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: '#16a34a' }} />
        Covered
      </div>

      <div className="pt-1 border-t border-gray-100">
        <button
          onClick={onToggleFresh}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span className={`w-3 h-3 rounded-sm border border-gray-300 flex items-center justify-center ${showFresh ? 'bg-red-100' : 'bg-white'}`}>
            {showFresh && <span className="w-1.5 h-1.5 rounded-sm bg-red-500 block" />}
          </span>
          Show unwalked
        </button>
      </div>

      <div className="pt-1 border-t border-gray-100 text-gray-400" style={{ pointerEvents: 'none' }}>
        {zoom < minZoom
          ? 'Zoom in to see roads'
          : loading
          ? <span className="animate-pulse">Loading…</span>
          : `${roadCount} segments`}
      </div>
    </div>
  )
}
