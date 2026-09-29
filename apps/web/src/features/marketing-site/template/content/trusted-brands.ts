// Defines the software brand marks shared by the homepage orbit, marquee, and footer.
import alibabaCloudUrl from '@lobehub/icons-static-svg/icons/alibabacloud-color.svg?url'
import antGroupUrl from '@lobehub/icons-static-svg/icons/antgroup-color.svg?url'
import baiduCloudUrl from '@lobehub/icons-static-svg/icons/baiducloud-color.svg?url'
import byteDanceUrl from '@lobehub/icons-static-svg/icons/bytedance-color.svg?url'
import cloudflareUrl from '@lobehub/icons-static-svg/icons/cloudflare-color.svg?url'
import deepSeekUrl from '@lobehub/icons-static-svg/icons/deepseek-color.svg?url'
import figmaUrl from '@lobehub/icons-static-svg/icons/figma-color.svg?url'
import googleCloudUrl from '@lobehub/icons-static-svg/icons/googlecloud-color.svg?url'
import huaweiCloudUrl from '@lobehub/icons-static-svg/icons/huaweicloud-color.svg?url'
import iflytekCloudUrl from '@lobehub/icons-static-svg/icons/iflytekcloud-color.svg?url'
import microsoftUrl from '@lobehub/icons-static-svg/icons/microsoft-color.svg?url'
import miniMaxUrl from '@lobehub/icons-static-svg/icons/minimax-color.svg?url'
import qiniuUrl from '@lobehub/icons-static-svg/icons/qiniu-color.svg?url'
import tencentCloudUrl from '@lobehub/icons-static-svg/icons/tencentcloud-color.svg?url'
import volcengineUrl from '@lobehub/icons-static-svg/icons/volcengine-color.svg?url'
import zhipuUrl from '@lobehub/icons-static-svg/icons/zhipu-color.svg?url'

export type BrandLogo = {
  image: string
  name: string
}

export type OrbitBrandLogo = BrandLogo & {
  pathId: string
  delay: number
}

// pathId selects an existing animation curve; it is independent of the brand identity.
export const orbitLogos: OrbitBrandLogo[] = [
  { pathId: 'next', image: alibabaCloudUrl, name: 'Alibaba Cloud', delay: 8.39 },
  { pathId: 'figma', image: tencentCloudUrl, name: 'Tencent Cloud', delay: 6.77 },
  { pathId: 'react', image: huaweiCloudUrl, name: 'Huawei Cloud', delay: 3.47 },
  { pathId: 'github', image: baiduCloudUrl, name: 'Baidu AI Cloud', delay: 1.66 },
  { pathId: 'icon1', image: byteDanceUrl, name: 'ByteDance', delay: 0 },
  { pathId: 'icon2', image: deepSeekUrl, name: 'DeepSeek', delay: 5.13 },
  { pathId: 'laravel', image: zhipuUrl, name: 'Zhipu AI', delay: 8.39 },
  { pathId: 'vue', image: qiniuUrl, name: 'Qiniu Cloud', delay: 6.77 },
  { pathId: 'claude', image: '/marketing/logos/gitlab-color.svg', name: 'GitLab', delay: 3.47 },
  { pathId: 'x', image: '/marketing/logos/docker-color.svg', name: 'Docker', delay: 1.66 },
  { pathId: 'icon3', image: '/marketing/logos/jetbrains-color.svg', name: 'JetBrains', delay: 0 },
  { pathId: 'instagram', image: figmaUrl, name: 'Figma', delay: 5.13 }
]

export const logos: BrandLogo[] = [
  { image: volcengineUrl, name: 'Volcengine' },
  { image: antGroupUrl, name: 'Ant Group' },
  { image: iflytekCloudUrl, name: 'iFLYTEK Cloud' },
  { image: miniMaxUrl, name: 'MiniMax' },
  { image: microsoftUrl, name: 'Microsoft' },
  { image: googleCloudUrl, name: 'Google Cloud' },
  { image: cloudflareUrl, name: 'Cloudflare' }
]
