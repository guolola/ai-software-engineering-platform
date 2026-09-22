// Renders the product logo from the shared public brand asset.
import type { ImgHTMLAttributes } from 'react'

const Logo = ({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
  <img
    src='/brand/uml-platform-logo.png'
    alt=''
    aria-hidden='true'
    draggable={false}
    className={className}
    {...props}
  />
)

export default Logo
