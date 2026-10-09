// Uses the AdminCN SidebarHeader composition and logo with product copy.
import { useTranslation } from 'react-i18next';
import Logo from '../assets/svg/logo';
import Link from '../../lib/template-link';
import { SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '../../ui/sidebar';

export function SidebarBrand() {
  const { t } = useTranslation();
  return <SidebarHeader>
    <SidebarMenu><SidebarMenuItem>
      <SidebarMenuButton size="lg" aria-label={t('common.appName')} className="h-12 gap-2.5 bg-transparent! p-0! group-data-[collapsible=icon]:h-12!" render={<Link href="/projects" />}>
        {/* Keep the brand at 32px in both states; only the copy collapses, overriding the 16px navigation-icon rule. */}
        <Logo className="size-8! shrink-0" />
        <div className="flex flex-col items-start group-data-[collapsible=icon]:hidden">
          <span className="text-lg font-semibold text-nowrap">{t('common.appName')}</span>
          <span className="text-xs font-light text-nowrap">UML Platform</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem></SidebarMenu>
  </SidebarHeader>;
}
