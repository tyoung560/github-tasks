import { describe, expect, it } from 'vitest'
import { dueLabel, isoDate, relativeTime, shortDate } from '../time'

const NOW = Date.parse('2026-03-04T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('relativeTime', () => {
  it.each([
    [30_000, 'now'],
    [12 * 60_000, '12m'],
    [5 * 3_600_000, '5h'],
    [3 * 86_400_000, '3d'],
    [21 * 86_400_000, '3w'],
    [800 * 86_400_000, '2y'],
  ])('renders %ims ago as %s', (delta, expected) => {
    expect(relativeTime(ago(delta), NOW)).toBe(expected)
  })

  it('handles future timestamps without going negative', () => {
    expect(relativeTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe('soon')
  })

  it('returns empty for unparseable input', () => {
    expect(relativeTime('not a date', NOW)).toBe('')
  })
})

describe('shortDate', () => {
  it('omits the year for dates in the current year', () => {
    expect(shortDate('2026-03-04T00:00:00Z', NOW)).not.toMatch(/2026/)
  })

  it('includes the year otherwise', () => {
    expect(shortDate('2023-03-04T00:00:00Z', NOW)).toMatch(/2023/)
  })
})

describe('isoDate', () => {
  it('is a bare yyyy-mm-dd', () => {
    expect(isoDate(NOW)).toBe('2026-03-04')
  })
})

describe('dueLabel', () => {
  it('describes upcoming, today and overdue', () => {
    expect(dueLabel('2026-03-07T12:00:00Z', NOW)).toBe('due in 3d')
    expect(dueLabel('2026-03-04T12:00:00Z', NOW)).toBe('due today')
    expect(dueLabel('2026-03-01T12:00:00Z', NOW)).toBe('3d overdue')
  })

  it('is null when there is no due date', () => {
    expect(dueLabel(null, NOW)).toBeNull()
  })
})
