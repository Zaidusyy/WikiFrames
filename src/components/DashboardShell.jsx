'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Icon from '@/components/Icon';
import { cx } from '@/components/ui';
import { WikiFramesMark } from '@/components/LandingHeader';

// §8.1 — the CRM layout: persistent left nav, top bar, main content area.
const NAV = [
  { href: '/dashboard', icon: 'cdxIconHome', label: 'Overview', exact: true },
  { href: '/dashboard/campaigns', icon: 'cdxIconCalendar', label: 'Campaigns' },
  { href: '/dashboard/templates', icon: 'wfIconFrame', label: 'Templates' },
  { href: '/dashboard/event-templates', icon: 'cdxIconLayout', label: 'Event templates' },
  { href: '/dashboard/gallery', icon: 'cdxIconImageGallery', label: 'Gallery' },
  { href: '/dashboard/links', icon: 'cdxIconQrCode', label: 'Links & QR' },
  { href: '/dashboard/team', icon: 'cdxIconUserGroup', label: 'Team' },
  { href: '/dashboard/settings', icon: 'cdxIconSettings', label: 'Settings' },
];

const SUPER_ADMIN_NAV = [
  { href: '/dashboard/admin/wall', icon: 'cdxIconFlag', label: 'Community wall' },
  { href: '/dashboard/admin/overview', icon: 'cdxIconChart', label: 'Platform stats' },
];

export default function DashboardShell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  // DASH-6: on mobile the side nav collapses into a drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const isAdmin = user.role === 'super_admin';

  async function logout() {
    await api.post('/auth/logout', {}).catch(() => {});
    router.push('/');
    router.refresh();
  }

  const renderItem = (item) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setDrawerOpen(false)}
          aria-current={active ? 'page' : undefined}
          className={cx(
            'flex items-center gap-3 rounded px-3 py-2 text-sm font-bold transition-colors',
            active ? 'bg-wiki-blue-light text-wiki-blue' : 'text-wiki-slate hover:bg-wiki-paper hover:text-wiki-ink'
          )}
        >
          <Icon name={item.icon} size="sm" />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex min-h-screen bg-wiki-paper">
      {/* Backdrop for the mobile drawer. */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-wiki-ink/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-wiki-line bg-white transition-transform lg:static lg:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 border-b border-wiki-line px-5 py-4">
          <WikiFramesMark size={26} />
          <span className="font-serif text-lg font-bold">WikiFrames</span>
        </Link>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Dashboard">
          <ul className="space-y-0.5">{NAV.map(renderItem)}</ul>
          {isAdmin ? (
            <>
              <p className="mb-1 mt-5 px-3 text-[11px] font-bold uppercase tracking-wide text-wiki-muted">Platform</p>
              <ul className="space-y-0.5">{SUPER_ADMIN_NAV.map(renderItem)}</ul>
            </>
          ) : null}
        </nav>

        <div className="border-t border-wiki-line p-4">
          <div className="flex items-center gap-3">
            {user.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-wiki-blue-light text-sm font-bold text-wiki-blue">
                {user.wikiUsername.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{user.wikiUsername}</p>
              <p className="truncate text-xs text-wiki-slate">{user.userGroup || 'No group set'}</p>
            </div>
          </div>
          <button type="button" onClick={logout} className="wf-btn-secondary mt-3 w-full">
            <Icon name="cdxIconLogOut" size="sm" /> Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-wiki-line bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="wf-btn-secondary px-2"
          >
            <Icon name="cdxIconMenu" />
          </button>
          <span className="font-serif text-lg font-bold">WikiFrames</span>
        </header>

        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
