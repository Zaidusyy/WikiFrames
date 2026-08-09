import Link from 'next/link';
import { config } from '@/lib/config';

export const metadata = { title: 'Sign-in unavailable' };

const REASONS = {
  state: {
    title: 'That sign-in attempt expired',
    body: 'Sign-in requests are only valid for a few minutes, and they have to finish in the browser tab that started them. Nothing is wrong with your account — just start again.',
  },
  upstream: {
    title: 'Meta-Wiki did not answer',
    body: 'We could not reach Wikimedia’s login service, or it declined the request. This is almost always temporary.',
  },
};

// AUTH-6: a friendly retry screen. There is deliberately no "continue without
// signing in" escape hatch here — falling back to weaker auth is not an option.
export default async function AuthUnavailablePage({ searchParams }) {
  const params = await searchParams;
  const reason = REASONS[params?.reason] ?? {
    title: 'Sign-in is not available right now',
    body: config.oauth.clientId
      ? 'We could not complete the Wikimedia sign-in. This is usually temporary — please try again in a moment.'
      : 'This WikiFrames instance has not finished registering its Wikimedia OAuth consumer yet, so organizer sign-in is switched off.',
  };

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
      <div className="wf-card p-8 text-center">
        <span aria-hidden="true" className="text-5xl">
          🔐
        </span>
        <h1 className="mt-4 font-serif text-2xl">{reason.title}</h1>
        <p className="mt-3 leading-relaxed text-wiki-slate">{reason.body}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/api/v1/auth/wikimedia" className="wf-btn-primary">
            Try signing in again
          </Link>
          <Link href="/" className="wf-btn-secondary">
            Back to the homepage
          </Link>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-wiki-slate">
          WikiFrames only ever signs you in with your existing Wikimedia account. We will never ask
          you to create a password here, and we never request permission to edit any wiki.
        </p>
      </div>

      {config.devLoginEnabled ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Development mode.</strong> A local sign-in shortcut is enabled on this instance
          (<code>ALLOW_DEV_LOGIN</code>).{' '}
          <a href="/api/v1/auth/dev?username=DevOrganizer" className="font-semibold underline">
            Sign in as DevOrganizer
          </a>
          . This route refuses to run in production.
        </div>
      ) : null}
    </main>
  );
}
