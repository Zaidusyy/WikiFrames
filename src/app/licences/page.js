import Link from 'next/link';
import Icon from '@/components/Icon';

export const metadata = {
  title: 'Licences & attribution',
  description: 'WikiFrames is free software under the MIT licence. The licences of everything it is built on and ships with.',
};

const REPO = 'https://github.com/Zaidusyy/WikiFrames';

// The components a reader is most likely to ask about. The complete,
// generated list with every licence text is THIRD_PARTY_NOTICES.md.
const COMPONENTS = [
  ['Next.js', 'MIT', 'https://github.com/vercel/next.js', 'Web framework'],
  ['React', 'MIT', 'https://github.com/facebook/react', 'User interface'],
  ['Fabric.js', 'MIT', 'https://github.com/fabricjs/fabric.js', 'Canvas editor'],
  ['sharp', 'Apache-2.0', 'https://github.com/lovell/sharp', 'Server-side image processing'],
  ['libvips', 'LGPL-3.0-or-later', 'https://github.com/libvips/libvips', 'Image library used by sharp, as an unmodified shared library'],
  ['Prisma', 'Apache-2.0', 'https://github.com/prisma/prisma', 'Database access'],
  ['archiver', 'MIT', 'https://github.com/archiverjs/node-archiver', 'Gallery ZIP export'],
  ['node-qrcode', 'MIT', 'https://github.com/soldair/node-qrcode', 'QR codes'],
  ['Codex icons', 'MIT', 'https://doc.wikimedia.org/codex/latest/icons/all-icons.html', 'Interface icons from the Wikimedia Design System'],
  ['Tailwind CSS', 'MIT', 'https://github.com/tailwindlabs/tailwindcss', 'Styling (build time only)'],
];

export default function LicencesPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-wiki-blue hover:underline">
        <Icon name="cdxIconArrowPrevious" size="sm" /> Back to WikiFrames
      </Link>

      <h1 className="mt-6 font-serif text-4xl">Licences &amp; attribution</h1>

      <section className="mt-8 rounded border border-wiki-line bg-wiki-paper p-6">
        <h2 className="font-serif text-2xl">WikiFrames is free software</h2>
        <p className="mt-3 leading-relaxed text-wiki-slate">
          The WikiFrames source code is released under the{' '}
          <a href={`${REPO}/blob/main/LICENSE`} className="font-bold text-wiki-blue hover:underline">
            MIT License
          </a>{' '}
          (SPDX: <code>MIT</code>), copyright © 2026 Zaid Sayyed and Sanskar Dubey. You
          may use, study, copy, modify and redistribute it, for any purpose, provided the copyright
          and licence notice stay with it. It comes with no warranty.
        </p>
        <p className="mt-3 leading-relaxed text-wiki-slate">
          Every community — inside the Wikimedia movement or not — is welcome to run its own
          instance.{' '}
          <a href={REPO} className="font-bold text-wiki-blue hover:underline">
            Source code and installation guide
          </a>
          .
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Artwork shipped with WikiFrames</h2>
        <p className="mt-3 leading-relaxed text-wiki-slate">
          The six starter frames, the decorative artwork in the editor and the WikiFrames mark are
          original work, released under the same MIT licence as the code. They are inspired by the
          wikis&apos; look but contain no Wikimedia trademark.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Content from Wikimedia Commons</h2>
        <p className="mt-3 leading-relaxed text-wiki-slate">
          Organizers can bring images from Wikimedia Commons into their frames. Each file keeps
          its own licence — for example CC BY-SA 4.0 — and WikiFrames records its author, title,
          licence and source page. Participants see these credits with the frame, and the editor&apos;s
          Health Check reminds organizers to put a credit line on frames whose licence requires
          one. When you reuse such an image, the same licence terms apply to you.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Built on open source</h2>
        <div className="mt-4 overflow-x-auto rounded border border-wiki-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-wiki-line bg-wiki-paper">
              <tr>
                <th className="px-4 py-2 font-bold">Component</th>
                <th className="px-4 py-2 font-bold">Licence</th>
                <th className="px-4 py-2 font-bold">Used for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wiki-line">
              {COMPONENTS.map(([name, license, url, use]) => (
                <tr key={name}>
                  <td className="px-4 py-2">
                    <a href={url} className="font-bold text-wiki-blue hover:underline" target="_blank" rel="noreferrer noopener">
                      {name}
                    </a>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{license}</td>
                  <td className="px-4 py-2 text-wiki-slate">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-wiki-slate">
          The complete list — every package in a production install, with its licence text — is in{' '}
          <a href={`${REPO}/blob/main/THIRD_PARTY_NOTICES.md`} className="font-bold text-wiki-blue hover:underline">
            THIRD_PARTY_NOTICES.md
          </a>
          , regenerated whenever dependencies change.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Trademarks</h2>
        <p className="mt-3 leading-relaxed text-wiki-slate">
          WikiFrames is an independent project and is not endorsed by or affiliated with the
          Wikimedia Foundation. &ldquo;Wikimedia&rdquo;, &ldquo;Wikipedia&rdquo;, the puzzle globe and
          the sister-project logos are trademarks of the Wikimedia Foundation, used here only to
          describe who the tool is built for, as the{' '}
          <a
            href="https://foundation.wikimedia.org/wiki/Policy:Trademark_policy"
            className="font-bold text-wiki-blue hover:underline"
            target="_blank"
            rel="noreferrer noopener"
          >
            Wikimedia trademark policy
          </a>{' '}
          permits. No Wikimedia logo is part of WikiFrames.
        </p>
      </section>
    </main>
  );
}
