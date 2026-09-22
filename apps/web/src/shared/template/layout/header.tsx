// AdminCN Header default layout: business navigation and actions fill the original slots.
import type { ReactNode } from 'react';
import { SidebarTrigger, useSidebar } from '../../ui/sidebar';
import { Separator } from '../../ui/separator';

export function AdmincnHeader({ navigation, actions, showSidebar = true }: { navigation: ReactNode; actions: ReactNode; showSidebar?: boolean }) {
  const { isMobile, state } = useSidebar();
  const sidebarOffset = isMobile
    ? '0px'
    : state === 'collapsed'
      ? 'var(--sidebar-width-icon)'
      : 'var(--sidebar-width)';

  return (
    <header
      style={{ left: sidebarOffset }}
      // Vaul hides the body scrollbar while a drawer is open. Its companion
      // class keeps fixed right-aligned elements anchored to the same edge.
      className="right-scroll-bar-position fixed right-0 top-0 z-50 mx-auto h-[53px] w-auto max-w-360 px-4 pt-2 transition-[left] duration-200 sm:px-6"
    >
      <div className="relative z-51 flex h-full w-full items-center justify-between rounded-xl border bg-card/82 px-4 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-card/72 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-4">
          {showSidebar && <SidebarTrigger className="[&_svg]:size-5!" />}
          <Separator orientation="vertical" className="hidden h-4! self-center! sm:block" />
          {navigation}
        </div>
        {/* Keep the navigation trigger reachable when tablet/mobile actions exceed the available width. */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{actions}</div>
      </div>
    </header>
  );
}
