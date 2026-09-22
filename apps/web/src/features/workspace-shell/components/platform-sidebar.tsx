// AdminCN sidebar composition for platform pages outside an individual project.
import { BookOpen, ClipboardCheck, CreditCard, FolderKanban, LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Link from '../../../shared/lib/template-link';
import { SidebarBrand } from '../../../shared/template/layout/sidebar-brand';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '../../../shared/ui/sidebar';

export function PlatformSidebar({ path }: { path: string }) {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();
  const items = [
    { path: '/dashboard', title: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/projects', title: t('nav.projects'), icon: FolderKanban },
    { path: '/exam', title: t('nav.exam'), icon: ClipboardCheck },
    { path: '/tutorial', title: t('nav.tutorial'), icon: BookOpen },
    { path: '/account/billing', title: t('nav.payment'), icon: CreditCard },
  ];
  return <Sidebar collapsible="icon"><SidebarBrand /><SidebarContent>
    <SidebarGroup><SidebarGroupContent><SidebarMenu>
      {items.map(item => <SidebarMenuItem key={item.path}>
        <SidebarMenuButton tooltip={item.title} aria-current={path.startsWith(item.path) ? "page" : undefined} isActive={path.startsWith(item.path)} className="data-active:bg-primary/10!" onClick={() => setOpenMobile(false)} render={<Link href={item.path} />}>
          <item.icon /><span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
    </SidebarMenu></SidebarGroupContent></SidebarGroup>
  </SidebarContent></Sidebar>;
}
