import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { contrastInk, LabelChip, StateBadge } from '../Bits'
import { ProgressRing } from '../ProgressRing'

describe('contrastInk', () => {
  it('puts dark ink on light labels and light ink on dark ones', () => {
    expect(contrastInk('#ffffff')).toBe('#1f2328')
    expect(contrastInk('#0e1116')).toBe('#ffffff')
  })

  it('handles GitHub’s common label colours', () => {
    expect(contrastInk('#d73a4a')).toBe('#ffffff') // red "bug"
    expect(contrastInk('#fbca04')).toBe('#1f2328') // yellow
  })

  it('falls back to white for a malformed colour', () => {
    expect(contrastInk('nope')).toBe('#ffffff')
  })
})

describe('StateBadge', () => {
  it('distinguishes completed from not planned', () => {
    const { rerender } = render(<StateBadge state="CLOSED" reason="COMPLETED" />)
    expect(screen.getByText('Closed')).toBeInTheDocument()

    rerender(<StateBadge state="CLOSED" reason="NOT_PLANNED" />)
    expect(screen.getByText('Not planned')).toBeInTheDocument()

    rerender(<StateBadge state="OPEN" />)
    expect(screen.getByText('Open')).toBeInTheDocument()
  })
})

describe('LabelChip', () => {
  it('shows the description as the tooltip when there is one', () => {
    render(<LabelChip label={{ name: 'bug', color: 'd73a4a', description: "Something isn't working" }} />)
    expect(screen.getByTitle("Something isn't working")).toHaveTextContent('bug')
  })

  it('falls back to the name', () => {
    render(<LabelChip label={{ name: 'chore', color: 'ededed', description: null }} />)
    expect(screen.getByTitle('chore')).toBeInTheDocument()
  })
})

describe('ProgressRing', () => {
  it('announces a percentage when it has no label', () => {
    render(<ProgressRing percent={42.4} />)
    expect(screen.getByRole('img', { name: '42% complete' })).toBeInTheDocument()
  })

  it('prefers the caller’s label', () => {
    render(<ProgressRing percent={50} label="3/6" />)
    expect(screen.getByRole('img', { name: '3/6 complete' })).toBeInTheDocument()
    expect(screen.getByText('3/6')).toBeInTheDocument()
  })

  it('clamps out-of-range input', () => {
    const { rerender } = render(<ProgressRing percent={-20} />)
    expect(screen.getByRole('img', { name: '0% complete' })).toBeInTheDocument()

    rerender(<ProgressRing percent={140} />)
    expect(screen.getByRole('img', { name: '100% complete' })).toBeInTheDocument()
  })
})
