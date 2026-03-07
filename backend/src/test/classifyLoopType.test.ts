import { describe, it, expect } from 'vitest'
import { classifyLoopType } from '../lib/routeClassifier'

// Helper: generate a straight out-and-back path along a line of longitude
// coords are [lng, lat]
function outAndBack(steps: number, stepSize = 0.0001): [number, number][] {
  const coords: [number, number][] = []
  for (let i = 0; i <= steps; i++) coords.push([8.5307, 47.196 + i * stepSize])
  for (let i = steps - 1; i >= 0; i--) coords.push([8.5307, 47.196 + i * stepSize])
  return coords
}

// Helper: generate a rectangular loop (go east, north, west, south back to start)
function rectangularLoop(sizeDeg = 0.005): [number, number][] {
  const [lng, lat] = [8.5307, 47.196]
  return [
    [lng, lat],
    [lng + sizeDeg, lat],
    [lng + sizeDeg, lat + sizeDeg],
    [lng, lat + sizeDeg],
    [lng, lat],
    // add intermediate points so length >= 6
    [lng, lat + sizeDeg * 0.5],
    [lng, lat],
  ]
}

describe('classifyLoopType', () => {
  it('returns loop for fewer than 6 coords', () => {
    expect(classifyLoopType([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])).toBe('loop')
  })

  it('classifies a straight out-and-back as out-and-back', () => {
    const coords = outAndBack(10)
    expect(classifyLoopType(coords)).toBe('out-and-back')
  })

  it('classifies a rectangular loop as loop', () => {
    const coords = rectangularLoop(0.005) // ~500m sides
    expect(classifyLoopType(coords)).toBe('loop')
  })

  it('classifies a large rectangular loop as loop', () => {
    const coords = rectangularLoop(0.01) // ~1km sides
    expect(classifyLoopType(coords)).toBe('loop')
  })

  it('classifies a slightly offset out-and-back (opposite sidewalk ~10m) as out-and-back', () => {
    // Parallel paths ~10m apart (one degree lat ≈ 111320m, so 10m ≈ 0.00009 deg)
    const coords: [number, number][] = []
    for (let i = 0; i <= 10; i++) coords.push([8.5307, 47.196 + i * 0.0001])
    // Return leg offset by ~10m in longitude
    for (let i = 10; i >= 0; i--) coords.push([8.5307 + 0.00013, 47.196 + i * 0.0001])
    expect(classifyLoopType(coords)).toBe('out-and-back')
  })
})
