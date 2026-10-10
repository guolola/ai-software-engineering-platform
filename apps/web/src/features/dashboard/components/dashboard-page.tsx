// Uses the supplied dashboard-shell-06 content inside the existing authenticated navigation shell.
import { Plus } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { PageContainer } from '@/shared/template/layout/page'
import { DashboardShellContent, DashboardShellSkeleton } from '@/shared/template/blocks/dashboard-shell-06/dashboard-shell-content'
import { useDashboardLabels } from '@/shared/template/blocks/dashboard-shell-06/dashboard-shell-labels'
import { useDashboardSummary } from '../hooks/use-dashboard-summary'
import { buildDashboardViewModel } from '../lib/dashboard-view-model'
import { useDashboardDuration } from '../hooks/use-dashboard-duration'

export function DashboardPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t, locale } = useDashboardLabels()
  const { data, loading, error, reload } = useDashboardSummary()
  const duration = useDashboardDuration(data, t)
  // Match the other platform pages' centered content rail and the header's inner width.
  return <main data-testid='dashboard-shell' className='relative min-h-0 min-w-0 w-full overflow-x-clip bg-background' aria-busy={loading}>
    <PageContainer>
    {loading ? <DashboardShellSkeleton /> : error ? <Alert variant='destructive'>
      <AlertTitle>{t('error')}</AlertTitle><AlertDescription>{error}</AlertDescription>
      <AlertAction><Button variant='outline' onClick={reload}>{t('retry')}</Button></AlertAction>
    </Alert> : data ? <>
      {data.totals.projects === 0 && <Alert className='mb-6'>
        <AlertDescription>{t('empty')}</AlertDescription>
        <AlertAction><Button onClick={() => onNavigate('/projects/new')}><Plus className='size-4' />{t('create')}</Button></AlertAction>
      </Alert>}
      <DashboardShellContent data={buildDashboardViewModel(data, t, locale)} duration={duration} onRefresh={reload}
        onProject={id => onNavigate(id ? `/projects/${encodeURIComponent(id)}` : '/projects')}
        onHistory={id => onNavigate(`/projects/${encodeURIComponent(id)}/history`)} labels={{ recent: t('recent') }} />
    </> : null}
    </PageContainer>
  </main>
}
