import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWalkTracking } from '../hooks/useWalkTracking'

const STORAGE_KEY = 'fresh-steps-walk-in-progress'

// Minimal GeolocationPosition mock
function makePosition(lat: number, lng: number, accuracy: number): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as GeolocationPosition
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useWalkTracking — localStorage', () => {
  it('saves to localStorage when a new point is accepted', () => {
    let positionCallback: ((p: GeolocationPosition) => void) = () => {}
    vi.spyOn(navigator.geolocation, 'watchPosition').mockImplementation((cb) => {
      positionCallback = cb
      return 1
    })
    vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {})

    const { result } = renderHook(() => useWalkTracking('user-1'))
    act(() => result.current.startTracking())

    // First point (no last coord — always accepted if accuracy ok)
    act(() => positionCallback(makePosition(47.196, 8.5307, 10)))
    // Second point >10m away
    act(() => positionCallback(makePosition(47.197, 8.5307, 10)))

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.coords.length).toBe(2)
    expect(saved.startedAt).toBeTruthy()
  })

  it('clears localStorage on dismissSummary', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ coords: [[8.5, 47.2]], startedAt: new Date().toISOString() }))
    vi.spyOn(navigator.geolocation, 'watchPosition').mockReturnValue(1 as unknown as number)
    vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {})

    const { result } = renderHook(() => useWalkTracking('user-1'))
    act(() => result.current.startTracking())
    act(() => result.current.dismissSummary())

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores in-progress walk from localStorage on mount', () => {
    const savedCoords: [number, number][] = [[8.5307, 47.196], [8.5308, 47.197]]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      coords: savedCoords,
      startedAt: new Date().toISOString(),
    }))

    vi.spyOn(navigator.geolocation, 'watchPosition').mockReturnValue(1 as unknown as number)
    vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {})

    const { result } = renderHook(() => useWalkTracking('user-1'))

    expect(result.current.state).toBe('tracking')
    expect(result.current.coords).toEqual(savedCoords)
  })
})
