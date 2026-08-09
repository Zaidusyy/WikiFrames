'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { cx } from '@/components/ui';
import { WikiFramesMark } from '@/components/LandingHeader';

// §8.1 — the CRM layout: persistent left nav, top bar, main content area.
const NAV = [
  { href: '/dashboard', icon: '🏠', label: 'Overview', exact: true },
  { href: '/dashboard/campaigns', icon: '📢', label: 'Campaigns' },
  { href: '/dashboard/templates', icon: '🎨', label: 'Templates' },
  { href: '/dashboard/event-templates', icon: '🧩', label: 'Event Templates' },
  { href: '/dashboard/gallery', icon: '🖼️', label: 'Gallery' },
  { href: '/dashboard/links', icon: '🔗', label: 'Links & QR' },
  { href: '/dashboard/team', icon: '👥', label: 'Team' },
  { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
];

const SUPER_ADMIN_NAV = [
  { href: '/dashboard/admin/wall', icon: '🛡️', label: 'Community wall' },
  { href: '/dashboard/admin/overview', icon: '📊', label: 'Platform stats' },
];

export default function DashboardShell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  // DASH-6: on mobile the side nav collapses into a drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = user.role === 'super_admin' ? [...NAV, ...SUPER_ADMIN_NAV] : NAV;

  async function logout() {
    await api.post('/auth/logout', {});
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-wiki-paper">
      {/* Backdrop for the mobile drawer. */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
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
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-wiki-blue-light text-wiki-blue-dark'
                        : 'text-wiki-slate hover:bg-wiki-paper hover:text-wiki-ink'
                    )}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-wiki-line p-4">
          <div className="flex items-center gap-3">
            {user.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded bg-wiki-blue-light text-sm font-bold text-wiki-blue">
                {user.wikiUsername.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.wikiUsername}</p>
              <p className="truncate text-xs text-wiki-slate">{user.userGroup || 'No group set'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-wiki-line px-3 py-2 text-sm font-medium text-wiki-slate hover:bg-wiki-paper"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-wiki-line bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg border border-wiki-line px-3 py-2"
          >
            ☰
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
