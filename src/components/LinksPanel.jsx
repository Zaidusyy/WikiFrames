'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, copyToClipboard, downloadUrl } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { Alert, Button, Explainer, StatusBadge, useToast } from '@/components/ui';

// §13 — the Links & QR panel. LINK-2 (regenerate) and LINK-4 (QR download) are
// the two actions organizers actually reach for at an event.
export default function LinksPanel({ campaign, initialUrl, initialQr, isOwner }) {
  const [url, setUrl] = useState(initialUrl);
  const [qr, setQr] = useState(initialQr);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useToast();

  async function regenerate() {
    if (
      !window.confirm(
        'This kills the current link and QR code immediately. Anything already printed or shared will stop working. Continue?'
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/campaigns/${campaign.id}/link/regenerate`, {});
      setUrl(res.participantUrl);
      setQr(res.qrDataUrl);
      setToast('New link and QR issued. The old one is dead.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast}

      <header>
        <Link href={`/dashboard/campaigns/${campaign.id}`} className="text-sm font-semibold text-wiki-blue hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 font-serif text-3xl">
          Links &amp; QR
          <StatusBadge status={campaign.status} />
        </h1>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      {campaign.status === 'draft' ? (
        <div className="wf-note">
          This campaign is still a draft, so the link below is not live yet. Launch it from the
          campaign&apos;s <strong>Review &amp; launch</strong> step.
        </div>
      ) : campaign.status === 'scheduled' ? (
        <div className="wf-note">
          The link is issued but opens for participants on{' '}
          <strong>{formatDate(campaign.registrationOpenDate, { hour: '2-digit', minute: '2-digit' })}</strong>.
          It is safe to print the QR now.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="wf-card p-6">
            <h2 className="font-serif text-xl">Participant link</h2>
            <p className="mt-1 text-sm text-wiki-slate">
              This is the only thing participants need — no account, no password.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <input
                readOnly
                value={url}
                className="wf-input flex-1 font-mono text-xs"
                onFocus={(e) => e.target.select()}
                aria-label="Participant link"
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  await copyToClipboard(url);
                  setToast('Link copied.');
                }}
              >
                Copy link
              </Button>
            </div>

            <Explainer>
              The token in this URL is 128 bits of randomness — it cannot be guessed, and it is not
              derived from anything about your campaign. Treat it like a key: share it with the
              people you want, and regenerate it if it leaks.
            </Explainer>

            {campaign.accessCode ? (
              <p className="mt-4 rounded-lg bg-wiki-paper px-4 py-3 text-sm">
                Participants must also type the venue access code{' '}
                <strong className="tracking-[0.3em]">{campaign.accessCode}</strong>. Put it on a
                slide or the registration desk.
              </p>
            ) : null}
          </div>

          <div className="wf-card p-6">
            <h2 className="font-serif text-xl">Where to put it</h2>
            <ul className="mt-3 space-y-2 text-sm text-wiki-slate">
              <li>• Print the SVG QR on the venue poster and the registration desk sign.</li>
              <li>• Drop the link into the event WhatsApp or Telegram group.</li>
              <li>• Put the QR on your last slide — people scan it while you take questions.</li>
              <li>• Add it to the event page on Meta-Wiki so latecomers can find it.</li>
            </ul>
          </div>

          {isOwner ? (
            <div className="wf-card border-rose-200 p-6">
              <h2 className="font-serif text-xl">Regenerate the link</h2>
              <p className="mt-1 text-sm text-wiki-slate">
                If the link leaked before your event, issue a new one. The old link and QR stop
                working the moment you do — reprint anything you have already put on paper.
              </p>
              <Button variant="danger" className="mt-4" onClick={regenerate} disabled={busy}>
                {busy ? 'Issuing…' : 'Regenerate link & QR'}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="wf-card h-fit p-6 text-center">
          <h2 className="font-serif text-xl">QR code</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`QR code linking to the ${campaign.name} campaign`}
            className="mx-auto mt-4 w-full max-w-[240px] rounded-lg border border-wiki-line"
          />
          <div className="mt-4 grid gap-2">
            <a
              href={downloadUrl(`/campaigns/${campaign.id}/qr?format=png`)}
              className="wf-btn-secondary justify-center"
            >
              ⬇ Download PNG (1024px)
            </a>
            <a
              href={downloadUrl(`/campaigns/${campaign.id}/qr?format=svg`)}
              className="wf-btn-secondary justify-center"
            >
              ⬇ Download SVG (print)
            </a>
          </div>
          <p className="mt-3 text-xs text-wiki-slate">
            Use the SVG for anything printed — it stays sharp at any size.
          </p>
        </div>
      </div>
    </div>
  );
}
