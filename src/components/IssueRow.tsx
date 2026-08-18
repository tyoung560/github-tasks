import { Link } from 'react-router-dom'
import { AvatarStack, LabelChip, StateIcon } from './Bits'
import { ProgressRing } from './ProgressRing'
import { IconComment, IconLink } from './Icon'
import { relativeTime } from '@/lib/time'
import { summaryProgress } from '@/lib/progress'
import type { IssueSummary } from '@/lib/github/types'

interface Props {
  issue: IssueSummary
  /** Hide the "owner/name" prefix when the list is already scoped to one repo. */
  showRepo?: boolean
  pending?: boolean
  onClick?: () => void
}

export function IssueRow({ issue, showRepo = true, pending, onClick }: Props) {
  const progress = summaryProgress(issue)
  const href = `/i/${issue.repo}/${issue.number}`

  const body = (
    <>
      <StateIcon state={issue.state} reason={issue.stateReason} size={16} />

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[0.9375rem] leading-snug font-medium text-ink">{issue.title}</p>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
          <span className="font-mono">
            {showRepo ? `${issue.repo}#${issue.number}` : `#${issue.number}`}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={issue.updatedAt}>{relativeTime(issue.updatedAt)}</time>
          {issue.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <IconComment size={11} />
              {issue.commentCount}
            </span>
          )}
          {issue.parent && (
            <span className="inline-flex max-w-[9rem] items-center gap-0.5 truncate" title={issue.parent.title}>
              <IconLink size={11} />#{issue.parent.number}
            </span>
          )}
          {pending && <span className="rounded-full bg-warn/15 px-1.5 py-0.5 font-semibold text-warn">Pending</span>}
        </p>

        {issue.labels.length > 0 && (
          <div className="scroll-x mt-1.5 flex gap-1.5 pb-0.5">
            {issue.labels.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {progress && (
          <ProgressRing
            percent={progress.percent}
            size={38}
            strokeWidth={4}
            label={`${progress.completed}/${progress.total}`}
          />
        )}
        {issue.assignees.length > 0 && <AvatarStack users={issue.assignees} size={18} max={2} />}
      </div>
    </>
  )

  const className =
    'flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left active:bg-surface transition-colors'

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    )
  }
  return (
    <Link to={href} className={className}>
      {body}
    </Link>
  )
}
