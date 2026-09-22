// Verifies transient operation feedback timing and interaction behavior.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FloatingAlertProvider, useFloatingAlert } from './floating-alert'

function AlertTrigger({ tone = 'success' }: { tone?: 'success' | 'destructive' }) {
  const { showAlert } = useFloatingAlert()
  return (
    <button type='button' onClick={() => showAlert({ title: '保存成功', tone })}>
      显示提示
    </button>
  )
}

describe('FloatingAlertProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes success feedback automatically after four seconds', () => {
    vi.useFakeTimers()
    render(<FloatingAlertProvider><AlertTrigger /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    expect(screen.getByText('保存成功')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(4_001))
    expect(screen.queryByText('保存成功')).not.toBeInTheDocument()
  })

  it('pauses the timer while the alert is hovered and supports manual close', () => {
    vi.useFakeTimers()
    render(<FloatingAlertProvider><AlertTrigger tone='destructive' /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    const alert = screen.getByRole('alert')
    fireEvent.mouseEnter(alert)
    act(() => vi.advanceTimersByTime(7_000))
    expect(screen.getByText('保存成功')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.queryByText('保存成功')).not.toBeInTheDocument()
  })
})
