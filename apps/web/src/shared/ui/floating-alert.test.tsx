// Verifies transient operation feedback timing and interaction behavior.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FloatingAlertProvider, floatingAlert, showFloatingAlert, useFloatingAlert } from './floating-alert'

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

  it('accepts imperative alerts and replaces an existing alert with the same id', () => {
    render(<FloatingAlertProvider><div>content</div></FloatingAlertProvider>)

    act(() => {
      showFloatingAlert({ id: 'network', title: '第一次', tone: 'destructive' })
      showFloatingAlert({ id: 'network', title: '第二次', tone: 'destructive' })
      floatingAlert.success('保存完成')
    })

    expect(screen.queryByText('第一次')).not.toBeInTheDocument()
    expect(screen.getByText('第二次')).toBeInTheDocument()
    expect(screen.getByText('保存完成')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })
})
