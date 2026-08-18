import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { Spinner } from '@/components/Bits'
import { Inbox } from '@/screens/Inbox'
import { IssueDetail } from '@/screens/IssueDetail'
import { NewIssue } from '@/screens/NewIssue'
import { Onboarding } from '@/screens/Onboarding'
import { PendingChanges } from '@/screens/PendingChanges'
import { RepoIssues } from '@/screens/RepoIssues'
import { Repos } from '@/screens/Repos'
import { Settings } from '@/screens/Settings'
import { useAuth } from '@/state/auth'
import { useSettings } from '@/state/settings'

export function App() {
  const { token, status } = useAuth()

  if (!token || status === 'anonymous' || status === 'invalid') return <Onboarding />

  if (status === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner size={24} />
      </div>
    )
  }

  return <SignedInApp />
}

function SignedInApp() {
  const navigate = useNavigate()
  const { defaultRepo, favorites } = useSettings()

  const quickAdd = () => {
    const repo = defaultRepo ?? favorites[0]
    navigate(repo ? `/new?repo=${encodeURIComponent(repo)}` : '/new')
  }

  return (
    <AppShell onQuickAdd={quickAdd}>
      <Routes>
        <Route path="/" element={<Inbox />} />
        <Route path="/repos" element={<Repos />} />
        <Route path="/r/:owner/:name" element={<RepoIssues />} />
        <Route path="/i/:owner/:name/:number" element={<IssueDetail />} />
        <Route path="/new" element={<NewIssue />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/pending" element={<PendingChanges />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdatePrompt />
    </AppShell>
  )
}
