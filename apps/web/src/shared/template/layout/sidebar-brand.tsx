// Uses the AdminCN SidebarHeader composition and logo with product copy.
import { useTranslation } from 'react-i18next';
import Logo from '../assets/svg/logo';
import Link from '../../lib/template-link';
import { SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '../../ui/sidebar';

export function SidebarBrand() {
  const { t } = useTranslation();
  return <SidebarHeader>
    <SidebarMenu><SidebarMenuItem>
      <SidebarMenuButton size="lg" className="gap-2.5 bg-transparent!" render={<Link href="/projects" />}>
        <Logo className="size-9 shrink-0 object-contain" />
        <div className="flex flex-col items-start">
          <span className="text-lg font-semibold text-nowrap">{t('common.appName')}</span>
          <span className="text-xs font-light text-nowrap">UML Platform</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem></SidebarMenu>
  </SidebarHeader>;
}
