'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { Button, Explainer, cx } from '@/components/ui';

/**
 * §9.1 step 3 / §12 — roles and badges.
 *
 * Roles are per-campaign by design: whatever the organizer enables here is
 * exactly what participants see. The seeded list is a starting point, not a
 * fixed vocabulary.
 */
export default function CampaignRoles({ campaign, seededRoles, onChange, onToast, onError }) {
  const [roles, setRoles] = useState(campaign.roles || []);
  const [required, setRequired] = useState(Boolean(campaign.roleRequired));
  const [customLabel, setCustomLabel] = useState('');
  const [customIcon, setCustomIcon] = useState('🏅');
  const [busy, setBusy] = useState(false);

  const enabled = new Set(roles.map((r) => r.label));

  function toggleSeeded(seeded) {
    setRoles((current) =>
      current.some((r) => r.label === seeded.label)
        ? current.filter((r) => r.label !== seeded.label)
        : [...current, { label: seeded.label, icon: seeded.icon }]
    );
  }

  function addCustom() {
    const label = customLabel.trim().slice(0, 30);
    if (!label || enabled.has(label)) return;
    setRoles((current) => [...current, { label, icon: customIcon }]);
    setCustomLabel('');
  }

  async function save() {
    setBusy(true);
    onError(null);
    try {
      const res = await api.put(`/campaigns/${campaign.id}/roles`, { roles });
      await api.patch(`/campaigns/${campaign.id}`, { roleRequired: required });
      setRoles(res.roles);
      onChange?.(res.roles, required);
      onToast('Roles saved.');
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Explainer>
        A role becomes a badge on the finished image (&ldquo;I&apos;m a Heritage Documenter
        🏛️&rdquo;) and the first line of the shared caption. It is the single thing that makes
        participants want to post — a generic frame is forgettable, a frame that says who they are
        is not.
      </Explainer>

      <div className="wf-card p-6">
        <h3 className="font-serif text-xl">Ready-made roles</h3>
        <p className="mt-1 text-sm text-wiki-slate">
          Tap to switch a role on or off for this campaign.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {seededRoles.map((seeded) => {
            const on = enabled.has(seeded.label);
            return (
              <button
                key={seeded.label}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSeeded(seeded)}
                className={cx(
                  'wf-chip',
                  on
                    ? 'bg-wiki-blue text-white ring-wiki-blue'
                    : 'bg-white text-wiki-slate ring-wiki-line hover:bg-wiki-paper'
                )}
              >
                <span aria-hidden="true">{seeded.icon}</span>
                {seeded.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="wf-card p-6">
        <h3 className="font-serif text-xl">Add your own character</h3>
        <p className="mt-1 text-sm text-wiki-slate">
          Anything that fits your event — &ldquo;Campus Ambassador&rdquo;, &ldquo;Translation
          Champion&rdquo;, &ldquo;First-time Editor&rdquo;. Up to 30 characters.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="wf-input w-20 text-center text-lg"
            value={customIcon}
            maxLength={4}
            onChange={(e) => setCustomIcon(e.target.value)}
            aria-label="Badge icon"
          />
          <input
            className="wf-input flex-1"
            value={customLabel}
            maxLength={30}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Campus Ambassador"
          />
          <Button variant="secondary" onClick={addCustom} disabled={!customLabel.trim()}>
            Add role
          </Button>
        </div>
      </div>

      <div className="wf-card p-6">
        <h3 className="font-serif text-xl">
          What participants will see ({roles.length})
        </h3>
        {roles.length === 0 ? (
          <p className="mt-3 text-sm text-wiki-slate">
            No roles selected. Participants will go straight from the template to their photo — that
            is a perfectly fine campaign too.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {roles.map((role, index) => (
              <li
                key={role.id || `${role.label}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-wiki-line px-3 py-2"
              >
                <span aria-hidden="true" className="text-lg">
                  {role.icon || '🏅'}
                </span>
                <span className="flex-1 text-sm">
                  <span className="font-semibold">{role.label}</span>
                  <span className="ml-2 text-xs text-wiki-slate">
                    badge reads &ldquo;I&apos;m a {role.label} {role.icon}&rdquo;
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setRoles((c) => c.filter((_, i) => i !== index))}
                  className="text-xs font-bold text-wiki-error hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="mt-5 flex cursor-pointer gap-3 rounded-lg border border-wiki-line p-4 hover:bg-wiki-paper">
          <input
            type="checkbox"
            className="mt-1"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={roles.length === 0}
          />
          <span className="text-sm">
            <span className="block font-semibold">Everyone must pick a role</span>
            <span className="text-wiki-slate">
              Leave this off and choosing a role stays optional, which is usually the friendlier
              default.
            </span>
          </span>
        </label>

        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save roles'}
          </Button>
        </div>
      </div>
    </div>
  );
}
