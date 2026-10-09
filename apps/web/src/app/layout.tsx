// Provides the Next.js document around the AdminCN default layout source.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './styles/index.css';

export const metadata: Metadata = {
  title: '软件工程实践平台',
  description: 'UML 软件工程实践平台',
  icons: {
    icon: [{ url: '/brand/uml-platform-logo.svg', type: 'image/svg+xml' }],
    shortcut: '/brand/uml-platform-logo.svg'
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='zh-CN' data-template='admincn' suppressHydrationWarning>
      <body className='flex min-h-full w-full flex-auto flex-col font-sans antialiased'>{children}</body>
    </html>
  );
}
