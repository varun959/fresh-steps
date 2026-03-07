import { describe, it, expect } from 'vitest'
import { haversineMeters, isAccuracyAcceptable, isFarEnough, totalDistanceKm } from '../lib/gps'

describe('isAccuracyAcceptable', () => {
  it('accepts readings at exactly 150m', () => {
    expect(isAccuracyAcceptable(150)).toBe(true)
  })
  it('accepts good GPS readings', () => {
    expect(isAccuracyAcceptable(10)).toBe(true)
    expect(isAccuracyAcceptable(50)).toBe(true)
  })
  it('rejects cell-tower/IP fixes above 150m', () => {
    expect(isAccuracyAcceptable(151)).toBe(false)
    expect(isAccuracyAcceptable(500)).toBe(false)
  })
})

describe('isFarEnough', () => {
  // Baar coords as baseline
  const base: [number, number] = [8.5307, 47.196]

  it('always accepts first point (no last coord)', () => {
    expect(isFarEnough(base, undefined)).toBe(true)
  })
  it('rejects points within 10m', () => {
    // ~5m north
    const nearby: [number, number] = [8.5307, 47.19605]
    expect(isFarEnough(nearby, base)).toBe(false)
  })
  it('accepts points more than 10m away', () => {
    // ~50m north
    const farAway: [number, number] = [8.5307, 47.1965]
    expect(isFarEnough(farAway, base)).toBe(true)
  })
})

describe('haversineMeters', () => {
  it('returns ~0 for identical points', () => {
    const p: [number, number] = [8.5307, 47.196]
    expect(haversineMeters(p, p)).toBeCloseTo(0)
  })
  it('returns ~111km per degree of latitude', () => {
    const a: [number, number] = [0, 0]
    const b: [number, number] = [0, 1]
    const dist = haversineMeters(a, b)
    expect(dist).toBeGreaterThan(110_000)
    expect(dist).toBeLessThan(112_000)
  })
})

describe('totalDistanceKm', () => {
  it('returns 0 for a single point', () => {
    expect(totalDistanceKm([[8.5307, 47.196]])).toBe(0)
  })
  it('sums segment distances', () => {
    // Two points ~111km apart
    const coords: [number, number][] = [[0, 0], [0, 1]]
    expect(totalDistanceKm(coords)).toBeCloseTo(111.32, 0)
  })
})
