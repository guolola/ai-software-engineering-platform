// Verifies the workbench table follows the active language while retaining enum-based filters.
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '@/shared/i18n'
import UserDatatable, { type Item } from './datatable-user'

const rows: Item[] = [
  { id: 'one', avatar: '', fallback: 'ON', user: '订单系统', email: 'Guest', role: 'editor', plan: 'enterprise', billing: 'manual-cash', status: 'pending' },
  { id: 'two', avatar: '', fallback: 'LI', user: '图书馆系统', email: 'Owner', role: 'admin', plan: 'team', billing: 'auto-debit', status: 'active' },
]

afterEach(async () => {
  await i18n.changeLanguage('zh-CN')
})

describe('UserDatatable localization', () => {
  it('shows Chinese labels and filters using the underlying role value', async () => {
    await i18n.changeLanguage('zh-CN')
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n}><UserDatatable data={rows} /></I18nextProvider>)

    expect(screen.getByText('筛选角色')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '用户' })).toBeInTheDocument()
    expect(screen.getByText('编辑者')).toBeInTheDocument()
    expect(screen.getByText('企业版')).toBeInTheDocument()
    expect(screen.getByText('手动—现金')).toBeInTheDocument()
    expect(screen.getByText('待生成')).toBeInTheDocument()
    expect(screen.getByText('显示第 1–2 条，共 2 条')).toBeInTheDocument()
    expect(screen.queryByText('Select Role')).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '筛选角色' }))
    await user.click(await screen.findByRole('option', { name: '管理员' }))
    expect(screen.getByText('图书馆系统')).toBeInTheDocument()
    expect(screen.queryByText('订单系统')).not.toBeInTheDocument()
  })

  it('retains English labels when English is selected', async () => {
    await i18n.changeLanguage('en')
    render(<I18nextProvider i18n={i18n}><UserDatatable data={[rows[0]!]} /></I18nextProvider>)

    expect(screen.getByText('Select Role')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'User' })).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 to 1 of 1 entries')).toBeInTheDocument()
  })
})
