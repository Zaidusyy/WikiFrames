'use client';

import { useEffect, useState } from 'react';

const BADGES = [
  { text: "I'm a Wikipedia Editor ✏️", bg: '#3366cc' },
  { text: "I'm a Heritage Documenter 🏛️", bg: '#00af89' },
  { text: "I'm a Future Wikimedian 🌱", bg: '#6b4ba1' },
  { text: "I'm a Commons Photographer 📷", bg: '#d73333' },
];

/**
 * §18.2 §1 "animated frame demo" — shows the product's actual idea (a frame
 * with a hole, a photo behind it, a badge on top) rather than a stock mockup.
 * Pure SVG/CSS so the hero stays inside the landing page's weight budget.
 */
export default function FrameDemo() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % BADGES.length), 2600);
    return () => clearInterval(timer);
  }, []);

  const badge = BADGES[index];

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-wiki-amber/40 blur-2xl" aria-hidden="true" />
      <div className="absolute -bottom-8 -right-4 h-28 w-28 rounded-full bg-wiki-green/30 blur-2xl" aria-hidden="true" />

      <figure className="relative overflow-hidden rounded-2xl border border-wiki-line bg-white shadow-card">
        <div className="relative aspect-square animate-floaty">
          {/* Stand-in for the participant's photo. */}
          <div className="absolute inset-0 bg-gradient-to-br from-sky-200 via-indigo-200 to-violet-200" />
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <mask id="wf-demo-cutout">
                <rect width="100" height="100" fill="#fff" />
                <circle cx="50" cy="42" r="26" fill="#000" />
              </mask>
            </defs>
            {/* The frame itself: everything except the circular cutout. */}
            <rect width="100" height="100" fill="#3366cc" mask="url(#wf-demo-cutout)" />
            <g fill="#ffcc33" opacity=".9">
              <circle cx="12" cy="14" r="3" />
              <circle cx="88" cy="20" r="2.5" />
              <circle cx="20" cy="82" r="2" />
              <circle cx="82" cy="76" r="3" />
            </g>
            <text
              x="50"
              y="12"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="6.5"
              fontFamily="Georgia, serif"
              fontWeight="bold"
            >
              I am attending
            </text>
          </svg>

          <div className="absolute inset-x-6 bottom-8 flex justify-center">
            <span
              key={badge.text}
              className="rounded-full px-4 py-2 text-center text-xs font-bold text-white shadow-lg transition-all"
              style={{ background: badge.bg }}
            >
              {badge.text}
            </span>
          </div>
        </div>

        <figcaption className="flex items-center justify-between gap-2 border-t border-wiki-line px-4 py-3 text-xs text-wiki-slate">
          <span>1:1 · square</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-wiki-green" />
            generated in 2.1s
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
