'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Button, Explainer, Field, useToast } from '@/components/ui';

// §4.1 / SEC-7 — co-team members edit campaign content but can never delete or
// cancel the campaign. The invite is by wiki username, matched against people
// who have already signed in at least once.
export default function TeamPanel({ campaign, owner, initialMembers, canInvite }) {
  const [members, setMembers] = useState(initialMembers);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useToast();

  async function invite(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/campaigns/${campaign.id}/members`, {
        wikiUsername: username.trim(),
      });
      setMembers((current) => [
        ...current.filter((m) => m.userId !== res.member.user.id),
        {
          userId: res.member.user.id,
          wikiUsername: res.member.user.wikiUsername,
          userPageUrl: res.member.user.userPageUrl,
        },
      ]);
      setUsername('');
      setToast(`${res.member.user.wikiUsername} can now help run this campaign.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(member) {
    if (!window.confirm(`Remove ${member.wikiUsername} from this campaign?`)) return;
    try {
      await api.del(`/campaigns/${campaign.id}/members?userId=${member.userId}`);
      setMembers((current) => current.filter((m) => m.userId !== member.userId));
      setToast('Member removed.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {toast}

      <header>
        <Link href={`/dashboard/campaigns/${campaign.id}`} className="text-sm font-semibold text-wiki-blue hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="mt-2 font-serif text-3xl">Team</h1>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      <div className="wf-card p-6">
        <h2 className="font-serif text-xl">Who can work on this campaign</h2>

        <ul className="mt-4 divide-y divide-wiki-line">
          <li className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-wiki-blue text-sm font-bold text-white">
              {owner.wikiUsername.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{owner.wikiUsername}</span>
              <span className="text-xs text-wiki-slate">Owner — full control</span>
            </span>
          </li>

          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-wiki-paper text-sm font-bold text-wiki-slate">
                {member.wikiUsername.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{member.wikiUsername}</span>
                <span className="text-xs text-wiki-slate">Co-team — can edit, cannot delete</span>
              </span>
              {canInvite ? (
                <button
                  type="button"
                  onClick={() => remove(member)}
                  className="text-xs font-medium text-rose-700 hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {members.length === 0 ? (
          <p className="mt-3 text-sm text-wiki-slate">
            Only you so far. Invite whoever is helping you run the event.
          </p>
        ) : null}
      </div>

      {canInvite ? (
        <form onSubmit={invite} className="wf-card space-y-4 p-6">
          <h2 className="font-serif text-xl">Invite a co-team member</h2>

          <Field
            label="Wiki username"
            hint="Exactly as it appears on the wiki. They need to have signed in to WikiFrames once — we never create an account on someone else’s behalf."
          >
            <input
              className="wf-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Jane_Wikimedian"
              required
            />
          </Field>

          <Explainer>
            Co-team members can edit templates, roles, captions and campaign details, and can see
            the gallery and analytics. They cannot cancel the campaign, delete it, or regenerate the
            participant link.
          </Explainer>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !username.trim()}>
              {busy ? 'Inviting…' : 'Invite'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="wf-note">Only the campaign owner can change who is on the team.</p>
      )}
    </div>
  );
}
