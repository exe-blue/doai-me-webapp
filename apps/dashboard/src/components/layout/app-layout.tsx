'use client';

import { ReactNode } from 'react';
import { SidebarProvider } from './sidebar-context';
import { AppSidebar, NavigationGroup } from './app-sidebar';
import { Header } from './header';
import { Toaster } from 'sonner';

interface AppLayoutProps {
  children: ReactNode;
  navigation: NavigationGroup[];
  logo?: ReactNode;
  sidebarFooter?: ReactNode;
  headerTitle?: string;
  showSearch?: boolean;
  showNotifications?: boolean;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  defaultCollapsed?: boolean;
}

export function AppLayout({
  children,
  navigation,
  logo,
  sidebarFooter,
  headerTitle,
  showSearch = true,
  showNotifications = true,
  user,
  onLogout,
  defaultCollapsed = false,
}: AppLayoutProps) {
  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar
          navigation={navigation}
          logo={logo}
          footer={sidebarFooter}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            title={headerTitle}
            showSearch={showSearch}
            showNotifications={showNotifications}
            user={user}
            onLogout={onLogout}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto py-6 px-4 lg:px-6">
              {children}
            </div>
          </main>
        </div>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </SidebarProvider>
  );
}
