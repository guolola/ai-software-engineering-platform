// Uses the AdminCN default-layout Sidebar composition with platform navigation.
import type { ReactNode } from 'react';
import { SidebarBrand } from './sidebar-brand';
import { Sidebar, SidebarContent, SidebarResizeHandle } from '../../ui/sidebar';

export function DefaultSidebar({
  children,
  resizeLabel,
}: {
  children: ReactNode;
  resizeLabel?: string;
}) {
  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      <SidebarBrand />
      <SidebarContent>
        {children}
      </SidebarContent>
      {resizeLabel && <SidebarResizeHandle label={resizeLabel} />}
    </Sidebar>
  );
}
