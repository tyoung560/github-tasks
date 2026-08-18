import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SubIssueTree } from '../SubIssueTree'
import { AuthProvider } from '@/state/auth'
import type { IssueNode } from '@/lib/github/types'

function node({ number, title, ...over }: Partial<IssueNode> & { number: number; title: string }): IssueNode {
  return {
    id: `I_${number}`,
    databaseId: number * 10,
    number,
    title,
    state: 'OPEN',
    stateReason: null,
    url: '',
    repo: 'acme/app',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    author: null,
    assignees: [],
    labels: [],
    commentCount: 0,
    subIssues: null,
    parent: null,
    children: [],
    hasUnloadedChildren: false,
    ...over,
  }
}

function renderTree(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

const ROOT = { repo: 'acme/app', number: 1 }

const tree = [
  node({
    number: 2,
    title: 'Design the schema',
    subIssues: { total: 2, completed: 1, percent: 50 },
    children: [
      node({ number: 4, title: 'Draft tables', state: 'CLOSED' }),
      node({ number: 5, title: 'Review with the team' }),
    ],
  }),
  node({ number: 3, title: 'Ship it' }),
]

describe('SubIssueTree', () => {
  it('renders the top level expanded and every child underneath', () => {
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep />)

    expect(screen.getByText('Design the schema')).toBeInTheDocument()
    expect(screen.getByText('Draft tables')).toBeInTheDocument()
    expect(screen.getByText('Review with the team')).toBeInTheDocument()
  })

  it('rolls the whole subtree into the parent’s ring', () => {
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep />)
    expect(screen.getByRole('img', { name: '1/2 complete' })).toBeInTheDocument()
  })

  it('collapses a branch on tap', async () => {
    const user = userEvent.setup()
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep />)

    await user.click(screen.getByRole('button', { name: 'Collapse #2' }))

    expect(screen.queryByText('Draft tables')).not.toBeInTheDocument()
    expect(screen.getByText('Design the schema')).toBeInTheDocument()
  })

  it('shows a closed child as struck through', () => {
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep />)
    expect(screen.getByText('Draft tables').className).toContain('line-through')
  })

  it('calls back with the node when its state icon is tapped', async () => {
    const user = userEvent.setup()
    const onToggleState = vi.fn()
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep onToggleState={onToggleState} />)

    await user.click(screen.getByRole('button', { name: 'Close #3' }))

    expect(onToggleState).toHaveBeenCalledWith(expect.objectContaining({ number: 3 }))
  })

  it('offers unlink only when the caller can handle it', async () => {
    const user = userEvent.setup()
    const onUnlink = vi.fn()
    const { rerender } = renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep />)
    expect(screen.queryByRole('button', { name: 'Unlink #3' })).not.toBeInTheDocument()

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter>
            <SubIssueTree nodes={tree} parent={ROOT} deep onUnlink={onUnlink} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Unlink #3' }))
    expect(onUnlink).toHaveBeenCalledWith(expect.objectContaining({ number: 3 }), ROOT)
  })

  it('links each row to its own issue', () => {
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep />)
    const link = screen.getByText('Ship it').closest('a')
    expect(link).toHaveAttribute('href', '/i/acme/app/3')
  })

  it('uses GitHub’s one-level counts when deep roll-up is off', () => {
    renderTree(
      <SubIssueTree
        nodes={[node({ number: 2, title: 'Epic', subIssues: { total: 8, completed: 6, percent: 75 } })]}
        parent={ROOT}
        deep={false}
      />,
    )
    expect(screen.getByRole('img', { name: '6/8 complete' })).toBeInTheDocument()
  })

  it('renders neither a ring nor an expander for a leaf node', () => {
    renderTree(<SubIssueTree nodes={[node({ number: 9, title: 'Solo' })]} parent={ROOT} deep />)
    const item = screen.getByText('Solo').closest('li')!
    expect(within(item).queryByRole('img')).not.toBeInTheDocument()
    expect(within(item).queryByRole('button', { name: /Expand|Collapse/ })).not.toBeInTheDocument()
  })
})

describe('SubIssueTree nesting', () => {
  it('unlinks a grandchild from its own parent, not from the root issue', async () => {
    const user = userEvent.setup()
    const onUnlink = vi.fn()
    renderTree(<SubIssueTree nodes={tree} parent={ROOT} deep onUnlink={onUnlink} />)

    await user.click(screen.getByRole('button', { name: 'Unlink #4' }))

    expect(onUnlink).toHaveBeenCalledWith(expect.objectContaining({ number: 4 }), {
      repo: 'acme/app',
      number: 2,
    })
  })
})
