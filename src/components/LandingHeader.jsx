'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// The landing page is statically generated, so the "are you signed in?" question
// is answered here on the client rather than at build time.
export default function LandingHeader() {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setUser(data))
      .catch(() => !cancelled && setUser(null));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-wiki-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <WikiFramesMark />
          <span className="font-serif text-xl font-bold tracking-tight">WikiFrames</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-4">
          <a href="/#how-it-works" className="hidden px-2 py-1 text-sm font-medium text-wiki-slate hover:text-wiki-ink sm:block">
            How it works
          </a>
          <a href="/#community" className="hidden px-2 py-1 text-sm font-medium text-wiki-slate hover:text-wiki-ink sm:block">
            Community
          </a>
          <Link href="/privacy" className="hidden px-2 py-1 text-sm font-medium text-wiki-slate hover:text-wiki-ink sm:block">
            Privacy
          </Link>

          {user === undefined ? (
            <span className="h-9 w-28 animate-pulse rounded-lg bg-wiki-paper" aria-hidden="true" />
          ) : user ? (
            <Link href="/dashboard" className="wf-btn-primary">
              Dashboard
            </Link>
          ) : (
            <Link href="/api/v1/auth/wikimedia" className="wf-btn-primary">
              Log in with Wikimedia
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * Original mark: a frame with a knowledge "spark" inside it. Deliberately not a
 * puzzle globe — §23.1 rules out the trademarked marks entirely.
 */
export function WikiFramesMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" role="presentation">
      <rect x="2" y="2" width="28" height="28" rx="6" fill="#3366cc" />
      <rect x="7" y="7" width="18" height="18" rx="3" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="4.5" fill="#ffcc33" />
    </svg>
  );
}
