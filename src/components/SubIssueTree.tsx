import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconChevronDown, IconChevronRight, IconTrash } from './Icon'
import { AvatarStack, Spinner, StateIcon } from './Bits'
import { ProgressRing } from './ProgressRing'
import { useSubIssues } from '@/hooks/useGithub'
import { directProgress, rollup } from '@/lib/progress'
import type { IssueNode } from '@/lib/github/types'

export interface ParentRef {
  repo: string
  number: number
}

interface TreeProps {
  nodes: IssueNode[]
  /** The issue these nodes hang off — the parent an unlink must be sent to. */
  parent: ParentRef
  /** Roll the whole loaded subtree into each ring instead of one level. */
  deep: boolean
  onUnlink?: (node: IssueNode, parent: ParentRef) => void
  onToggleState?: (node: IssueNode) => void
  busyKey?: string | null
  depth?: number
}

export function SubIssueTree({ nodes, parent, deep, onUnlink, onToggleState, busyKey, depth = 0 }: TreeProps) {
  return (
    <ul className={depth === 0 ? '' : 'border-l border-line pl-3'}>
      {nodes.map((node) => (
        <SubIssueNode
          key={`${node.repo}#${node.number}`}
          node={node}
          parent={parent}
          deep={deep}
          onUnlink={onUnlink}
          onToggleState={onToggleState}
          busyKey={busyKey}
          depth={depth}
        />
      ))}
    </ul>
  )
}

function SubIssueNode({
  node,
  parent,
  deep,
  onUnlink,
  onToggleState,
  busyKey,
  depth = 0,
}: Omit<TreeProps, 'nodes'> & { node: IssueNode }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const key = `${node.repo}#${node.number}`
  const busy = busyKey === key

  // Levels the detail query did not reach are fetched the first time they open.
  const needsFetch = expanded && node.hasUnloadedChildren && node.children.length === 0
  const lazy = useSubIssues(node.repo, node.number, needsFetch)
  const children = node.children.length ? node.children : (lazy.data ?? [])

  const progress = deep
    ? rollup({ children, subIssues: node.subIssues, hasUnloadedChildren: node.hasUnloadedChildren && !children.length })
    : directProgress(node.subIssues)
  const hasChildren = progress.total > 0

  return (
    <li>
      <div className="flex items-center gap-1.5 border-b border-line py-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-faint"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} #${node.number}`}
            aria-expanded={expanded}
          >
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
        ) : (
          // A leaf keeps the chevron's width so rows stay aligned, but must not
          // put an empty control into the accessibility tree.
          <span className="h-8 w-6 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onToggleState?.(node)}
          disabled={!onToggleState || busy}
          aria-label={node.state === 'OPEN' ? `Close #${node.number}` : `Reopen #${node.number}`}
          className="tap flex w-8 shrink-0 items-center justify-center disabled:opacity-100"
        >
          {busy ? <Spinner size={15} /> : <StateIcon state={node.state} reason={node.stateReason} size={17} />}
        </button>

        <Link to={`/i/${node.repo}/${node.number}`} className="min-w-0 flex-1 py-0.5">
          <span
            className={`line-clamp-2 text-[0.875rem] leading-snug ${
              node.state === 'CLOSED' ? 'text-muted line-through decoration-1' : 'text-ink'
            }`}
          >
            {node.title}
          </span>
          <span className="mt-0.5 block font-mono text-[0.6875rem] text-faint">#{node.number}</span>
        </Link>

        {node.assignees.length > 0 && <AvatarStack users={node.assignees} size={16} max={1} />}

        {hasChildren && (
          <ProgressRing
            percent={progress.percent}
            size={30}
            strokeWidth={3.5}
            label={`${progress.completed}/${progress.total}`}
            partial={progress.partial}
          />
        )}

        {onUnlink && (
          <button
            type="button"
            onClick={() => onUnlink(node, parent)}
            className="tap flex w-8 shrink-0 items-center justify-center text-faint active:text-danger"
            aria-label={`Unlink #${node.number}`}
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="ml-3">
          {lazy.isLoading && (
            <p className="flex items-center gap-2 py-2 pl-3 text-xs text-faint">
              <Spinner size={13} /> Loading sub-issues…
            </p>
          )}
          {children.length > 0 && (
            <SubIssueTree
              nodes={children}
              // Children unlink from this node, not from the issue at the root.
              parent={{ repo: node.repo, number: node.number }}
              deep={deep}
              onUnlink={onUnlink}
              onToggleState={onToggleState}
              busyKey={busyKey}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </li>
  )
}
