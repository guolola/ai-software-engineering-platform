// Flow template adapter for the shared product logo asset.
import type { ImgHTMLAttributes } from 'react'

const FlowLogo = ({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
  <img
    src='/brand/uml-platform-logo.png'
    alt=''
    aria-hidden='true'
    draggable={false}
    className={className}
    {...props}
  />
)

export default FlowLogo
