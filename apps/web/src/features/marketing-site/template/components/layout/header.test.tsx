// Verifies the marketing header shares the workspace palette and light/dark theme state.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppI18nProvider } from '@/app/providers/i18n-provider'
import { ThemeProvider, themePresets } from '@/shared/ui/theme-provider'

import { TooltipProvider } from '../ui/tooltip'
import Header from './header'

vi.mock('@/features/user-platform/services/platform-api', () => ({
  AUTH_SESSION_CHANGED_EVENT: 'uml-platform-auth-session-changed',
  notifyAuthSessionChanged: vi.fn(),
  platformApi: {
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => ({ user: null })),
  },
}))

const presetCssVariables = new Set(
  Object.values(themePresets).flatMap((preset) =>
    Object.values(preset.styles).flatMap((styles) => Object.keys(styles)),
  ),
)

function renderHeader() {
  return render(
    <AppI18nProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Header navigationData={[]} />
        </TooltipProvider>
      </ThemeProvider>
    </AppI18nProvider>,
  )
}

beforeEach(() => {
  localStorage.setItem('admincn-ui-theme', 'light')
  localStorage.setItem('uml-lab-locale-preference', 'zh-CN')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('light', 'dark')
  for (const key of presetCssVariables) {
    document.documentElement.style.removeProperty(`--${key}`)
  }
})

describe('marketing header theme controls', () => {
  it('renders the shared palette immediately before the light/dark toggle', async () => {
    renderHeader()

    const paletteButton = await screen.findByRole('button', { name: '主题色板' })
    const modeButton = screen.getByRole('button', { name: '切换明暗主题' })

    expect(
      paletteButton.compareDocumentPosition(modeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(paletteButton).toHaveClass('size-10', 'rounded-lg')

    await userEvent.click(paletteButton)
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(13)
    expect(screen.getByRole('menuitemradio', { name: '默认' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Caffeine' })).toBeInTheDocument()
  })

  it('applies one palette to the marketing header and its dark-mode branch', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(await screen.findByRole('button', { name: '主题色板' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Caffeine' }))

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--primary'))
        .toBe(themePresets.caffeine.styles.light.primary)
    })
    expect(localStorage.getItem('admincn-ui-theme-preset')).toBe('caffeine')

    const modeButton = screen.getByRole('button', { name: '切换明暗主题' })
    const icons = modeButton.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    expect(icons[0]).toHaveClass('scale-100', 'dark:scale-0')
    expect(icons[1]).toHaveClass('scale-0', 'dark:scale-100')

    await user.click(modeButton)
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
      expect(document.documentElement.style.getPropertyValue('--primary'))
        .toBe(themePresets.caffeine.styles.dark.primary)
    })
    expect(localStorage.getItem('admincn-ui-theme')).toBe('dark')
  })
})
