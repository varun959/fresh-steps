import { useState, useRef, useEffect } from 'react'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

interface LocationSearchProps {
  onSelect: (lat: number, lng: number) => void
}

export function LocationSearch({ onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: value,
          format: 'json',
          limit: '5',
          viewbox: '8.3,47.5,8.8,47.1', // Baar / Zurich area (west,north,east,south)
          bounded: '0',                   // fall back to global if no local hits
        })
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { signal: controller.signal, headers: { 'Accept-Language': 'en' } }
        )
        if (!res.ok) throw new Error('search failed')
        setResults(await res.json() as NominatimResult[])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 500)
  }

  function handleSelect(r: NominatimResult) {
    setQuery(r.display_name.split(',')[0])
    setResults([])
    onSelect(Number(r.lat), Number(r.lon))
  }

  return (
    <div
      style={{ zIndex: 1000, top: '3.25rem', left: '50%', transform: 'translateX(-50%)' }}
      className="absolute w-72"
    >
      {/* Input row */}
      <div className="relative">
        <span className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setTimeout(() => setResults([]), 150)}
          placeholder="Search location…"
          className="w-full pl-8 pr-7 py-2 text-sm rounded-xl shadow-md bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        {loading && (
          <span className="absolute right-2.5 top-2.5 text-gray-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </span>
        )}
        {!loading && query && (
          <button
            className="absolute right-2 top-1.5 text-lg leading-none text-gray-400 hover:text-gray-600"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setResults([]) }}
          >
            ×
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {results.length > 0 && (
        <ul className="mt-1 bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 text-left">
          {results.map(r => (
            <li key={r.place_id}>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(r)}
              >
                <div className="font-medium text-gray-800 truncate">
                  {r.display_name.split(',')[0]}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {r.display_name.split(',').slice(1, 3).join(',')}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
