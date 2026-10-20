import Link from 'next/link';
import Icon from '@/components/Icon';

export const metadata = { title: 'Not found' };

// LINK-3: an expired, mistyped or never-valid campaign link lands here. It says
// the same thing either way — we never confirm that a secret link exists.
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <div className="wf-card p-8 text-center">
        <Icon name="cdxIconSearch" size="xl" className="mx-auto text-wiki-border" />
        <h1 className="mt-4 font-serif text-2xl">We could not find that</h1>
        <p className="mt-3 leading-relaxed text-wiki-slate">
          The page or campaign link you followed does not exist, has been withdrawn, or was typed
          slightly differently. If someone gave you a QR code, try scanning it again.
        </p>
        <Link href="/" className="wf-btn-primary mt-6">
          Go to WikiFrames
        </Link>
      </div>
    </main>
  );
}
