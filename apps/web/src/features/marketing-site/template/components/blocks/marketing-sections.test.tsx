// Guards the homepage brand assets and the original benefits/FAQ presentation behavior.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Benefits from './benefits/benefits'
import FAQ from './faq/faq'
import TrustedBrands from './trusted-brands/trusted-brands'
import Footer from '../layout/footer'
import { flowText } from '../../../model/flow-copy'
import { benefits } from '../../content/benefits'
import { faqItems } from '../../content/faqs'
import { logos } from '../../content/trusted-brands'

describe('marketing homepage sections', () => {
  it('uses the seven local software engineering brand logos', () => {
    render(<TrustedBrands brandLogos={logos} />)

    expect(logos).toHaveLength(7)
    for (const logo of logos) {
      const renderedLogos = screen.getAllByAltText(flowText(logo.name))
      expect(renderedLogos.length).toBeGreaterThan(0)
      expect(renderedLogos[0]).toHaveAttribute('src', logo.image)
      expect(logo.image).toMatch(/^\/marketing\/logos\/.+\.svg$/u)
    }
  })

  it('keeps the original sticky benefits layout while rendering shadcn-studio previews', () => {
    const { container } = render(<Benefits featuresList={benefits} />)

    expect(screen.getByRole('heading', { name: flowText('How Flow Helps You') })).toBeInTheDocument()
    expect(container.querySelectorAll('#benefits .sticky')).not.toHaveLength(0)
    expect(screen.getAllByTestId('benefit-studio-preview')).toHaveLength(benefits.length * 2)
    for (const kind of ['overview', 'models', 'workflow', 'history']) {
      expect(container.querySelectorAll(`[data-preview-kind="${kind}"]`)).toHaveLength(2)
    }
    expect(container.querySelector('#benefits img')).not.toBeInTheDocument()
  })

  it('only swaps the FAQ illustration while preserving its layout and hover animation', () => {
    render(<FAQ faqItems={faqItems} />)

    const preview = screen.getByTestId('faq-dashboard-preview')
    expect(preview).toHaveClass('max-w-148', 'lg:max-xl:max-h-95')
    expect(preview.parentElement).toHaveClass('lg:grid-cols-2')

    const images = preview.querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', '/marketing/generated/workbench-dashboard-light.png')
    expect(images[1]).toHaveAttribute('src', '/marketing/generated/workbench-dashboard-dark.png')
    expect(images[0]).toHaveClass('scale-90', 'group-hover:scale-100')
    expect(images[1]).toHaveClass('scale-90', 'group-hover:scale-100')
  })

  it('shows the personal-site statement, contact and regulatory filing links', () => {
    render(<Footer />)

    expect(screen.getByText(/本站为个人技术分享网站/u)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '672250123@qq.com' })).toHaveAttribute(
      'href',
      'mailto:672250123@qq.com'
    )
    expect(screen.getByRole('link', { name: '闽ICP备2026024395号' })).toHaveAttribute(
      'href',
      'https://beian.miit.gov.cn/'
    )
    expect(screen.getByRole('link', { name: '闽公网安备35010402351938号' })).toHaveAttribute(
      'href',
      'https://beian.mps.gov.cn/#/query/webSearch?code=35010402351938'
    )
    expect(screen.queryByLabelText('Github Link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Instagram Link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Twitter Link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Youtube Link')).not.toBeInTheDocument()
    for (const logo of logos) {
      expect(screen.getAllByAltText(flowText(logo.name)).at(-1)).toHaveAttribute('src', logo.image)
    }
  })
})
