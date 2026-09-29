// Verifies the new marketing hero's localized copy, real links, retained background, and static motion option.
import { readFileSync } from 'node:fs'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/shared/i18n'
import { orbitLogos } from '@/features/marketing-site/template/content/trusted-brands'
import HeroSection from './platform-hero-section'

const reducedMotion = vi.hoisted(() => ({ value: false }))
vi.mock('motion/react', async importOriginal => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => reducedMotion.value
}))

describe('marketing hero', () => {
  beforeEach(async () => {
    reducedMotion.value = false
    await i18n.changeLanguage('zh-CN')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows platform content and keeps the existing grid background', () => {
    const { container } = render(<HeroSection />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/用 AI 连接\s*需求/u)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('🚀')
    expect(screen.getByText('从需求分析、UML 建模到代码和说明书，在一个项目中完成可追踪的实践流程。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '开始创建项目' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: '查看价格' })).toHaveAttribute('href', '/#pricing')
    const socialProof = screen.getByTestId('hero-social-proof')
    expect(socialProof).toHaveTextContent('界面示例 · 需求 · 建模 · 交付')
    expect(socialProof).toHaveTextContent('4.5')
    expect(socialProof.querySelectorAll('[data-slot="avatar"]')).toHaveLength(4)
    expect(socialProof.querySelectorAll('[data-slot="rating-star"]')).toHaveLength(5)
    expect(screen.getByRole('img', { name: '示例评分：满分 5 分中的 4.5 分' })).toBeInTheDocument()
    for (const number of [11, 12, 13, 14]) {
      const asset = readFileSync(`public/marketing/avatars/avatar-${number}.png`)
      expect(asset.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
    expect(screen.getByTestId('hero-capability-card-left')).toHaveTextContent('需求 → UML 模型')
    expect(screen.getByTestId('hero-capability-card-right')).toHaveTextContent('模型 → 代码与文档')
    const orbit = screen.getByTestId('hero-orbit')
    expect(orbit).toHaveClass('pointer-events-none')
    const brandMarks = orbit.querySelectorAll('[data-brand-name]')
    expect(brandMarks).toHaveLength(12)
    expect(Array.from(brandMarks, mark => mark.getAttribute('data-brand-name'))).toEqual(orbitLogos.map(logo => logo.name))
    expect(orbit.querySelectorAll('[data-brand-name] img')).toHaveLength(12)
    for (const logo of orbit.querySelectorAll('[data-brand-name] img')) expect(logo).toHaveClass('grayscale')
    expect(orbit.querySelectorAll('[data-brand-name] svg')).toHaveLength(0)
    expect(orbit.querySelector('img[src="/marketing/logos/github.svg"]')).toBeNull()
    expect(container.querySelectorAll('#home .cell').length).toBeGreaterThan(0)
    expect(container.querySelector('img[src^="/help/images/workbench-"]')).toBeNull()
    expect(container.textContent).not.toContain('1000+')
  })

  it('renders the same hero in English', async () => {
    await i18n.changeLanguage('en')
    render(<HeroSection />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connect Requirements with AI')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('🚀')
    expect(screen.getByRole('link', { name: 'Create a project' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: 'View pricing' })).toHaveAttribute('href', '/#pricing')
    expect(screen.getByTestId('hero-social-proof')).toHaveTextContent('Interface example · Requirements · Models · Delivery')
    expect(screen.getByRole('img', { name: 'Example rating: 4.5 out of 5' })).toBeInTheDocument()
  })

  it('keeps the changing headline still when reduced motion is requested', () => {
    reducedMotion.value = true
    vi.useFakeTimers()
    render(<HeroSection />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('需求')
    act(() => { vi.advanceTimersByTime(4_000) })
    expect(heading).toHaveTextContent('需求')
  })
})
