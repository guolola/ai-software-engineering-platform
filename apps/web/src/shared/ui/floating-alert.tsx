// Non-blocking, top-centered alerts for short-lived operation feedback.
'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/ui/utils'

export type FloatingAlertTone = 'success' | 'info' | 'warning' | 'destructive'
export type FloatingAlertInput = {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  tone?: FloatingAlertTone
  durationMs?: number
}

type FloatingAlertEntry = FloatingAlertInput & { id: string; tone: FloatingAlertTone; durationMs: number }
type FloatingAlertContextValue = {
  showAlert: (alert: FloatingAlertInput) => string
  dismissAlert: (id: string) => void
}

const fallbackFloatingAlertContext: FloatingAlertContextValue = {
  showAlert: alert => alert.id ?? '',
  dismissAlert: () => undefined
}

const FloatingAlertContext = React.createContext<FloatingAlertContextValue>(fallbackFloatingAlertContext)

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function FloatingAlertCard({ alert, onDismiss }: { alert: FloatingAlertEntry; onDismiss: () => void }) {
  const startedAt = React.useRef(Date.now())
  const remaining = React.useRef(alert.durationMs)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const startTimer = React.useCallback(() => {
    startedAt.current = Date.now()
    timer.current = setTimeout(onDismiss, remaining.current)
  }, [onDismiss])
  const pauseTimer = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
  }, [])

  React.useEffect(() => {
    startTimer()
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [startTimer])

  const Icon = alert.tone === 'success' ? CheckCircle2 : alert.tone === 'warning' ? TriangleAlert : alert.tone === 'destructive' ? XCircle : Info
  return (
    <Alert
      variant={alert.tone === 'destructive' ? 'destructive' : 'default'}
      className={cn(
        'bg-card/96 w-full shadow-xl backdrop-blur-xl',
        alert.tone === 'success' && 'border-success/45 text-success',
        alert.tone === 'warning' && 'border-amber-500/45 text-amber-700 dark:text-amber-300',
        alert.tone === 'info' && 'border-primary/35'
      )}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onFocusCapture={pauseTimer}
      onBlurCapture={startTimer}
    >
      <Icon aria-hidden='true' />
      <AlertTitle>{alert.title}</AlertTitle>
      {alert.description ? <AlertDescription className='text-current/80'>{alert.description}</AlertDescription> : null}
      <AlertAction>
        <Button type='button' variant='ghost' size='icon-xs' aria-label='关闭提示' onClick={onDismiss}>
          <X />
        </Button>
      </AlertAction>
    </Alert>
  )
}

export function FloatingAlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = React.useState<FloatingAlertEntry[]>([])
  const dismissAlert = React.useCallback((id: string) => setAlerts(current => current.filter(alert => alert.id !== id)), [])
  const showAlert = React.useCallback((input: FloatingAlertInput) => {
    const id = input.id ?? makeId()
    const tone = input.tone ?? 'info'
    const entry: FloatingAlertEntry = {
      ...input,
      id,
      tone,
      durationMs: input.durationMs ?? (tone === 'warning' || tone === 'destructive' ? 6000 : 4000)
    }
    setAlerts(current => [...current.filter(alert => alert.id !== id), entry].slice(-3))
    return id
  }, [])
  const value = React.useMemo(() => ({ showAlert, dismissAlert }), [dismissAlert, showAlert])
  const drawerPortalTarget = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>('[data-slot="drawer-content"]')
  const viewport = (
    <div className='font-sans pointer-events-none fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-xl flex-col gap-2 sm:top-20' aria-live='polite' aria-atomic='false'>
      {alerts.map(alert => (
        <div key={alert.id} className='pointer-events-auto animate-in fade-in slide-in-from-top-2'>
          <FloatingAlertCard alert={alert} onDismiss={() => dismissAlert(alert.id)} />
        </div>
      ))}
    </div>
  )

  return (
    <FloatingAlertContext.Provider value={value}>
      {children}
      {drawerPortalTarget ? createPortal(viewport, drawerPortalTarget) : viewport}
    </FloatingAlertContext.Provider>
  )
}

export function useFloatingAlert() {
  return React.useContext(FloatingAlertContext)
}
