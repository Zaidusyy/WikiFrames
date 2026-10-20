import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertCanDelete, loadCampaignFor } from '@/lib/authz';
import { LIFECYCLE, effectiveStatus, purgeDateFor } from '@/lib/campaigns';
import { campaignUrl } from '@/lib/qr';

export const dynamic = 'force-dynamic';

// The lifecycle transitions of §9.2, expressed as one guarded state machine so
// that no route can move a campaign somewhere the diagram does not allow.
const TRANSITIONS = {
  launch: { from: [LIFECYCLE.DRAFT], to: LIFECYCLE.ACTIVE },
  pause: { from: [LIFECYCLE.ACTIVE], to: LIFECYCLE.INACTIVE },
  resume: { from: [LIFECYCLE.INACTIVE], to: LIFECYCLE.ACTIVE },
  cancel: { from: [LIFECYCLE.DRAFT, LIFECYCLE.ACTIVE, LIFECYCLE.INACTIVE], to: LIFECYCLE.CANCELLED },
};

export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign, access } = await loadCampaignFor(user, id);
  const { action } = await readJson(req);

  // Own properties only: "constructor" or "__proto__" must not look like a transition.
  const transition = typeof action === 'string' && Object.hasOwn(TRANSITIONS, action) ? TRANSITIONS[action] : null;
  if (!transition) throw badRequest('Unknown lifecycle action.');
  // DASH-4: cancelling kills the participant link, so it is owner-only.
  if (action === 'cancel') assertCanDelete(access);

  if (!transition.from.includes(campaign.status)) {
    throw badRequest(
      `A ${campaign.status} campaign cannot be ${action === 'launch' ? 'launched' : `${action}d`}.`
    );
  }

  if (action === 'launch') {
    const [templates, mandatoryCaption] = await Promise.all([
      prisma.template.count({ where: { campaignId: campaign.id } }),
      prisma.caption.findFirst({ where: { campaignId: campaign.id, isMandatory: true } }),
    ]);
    if (!templates) throw badRequest('Add at least one template before launching.');
    // CAP-1: the mandatory caption is what every shared image carries.
    if (!mandatoryCaption) throw badRequest('Add the mandatory caption before launching.');
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: transition.to,
      ...(action === 'launch'
        ? { launchedAt: new Date(), purgeAt: purgeDateFor(campaign.eventEndDate) }
        : {}),
    },
  });

  return ok({
    campaign: updated,
    effectiveStatus: effectiveStatus(updated),
    participantUrl: campaignUrl(updated.slug, updated.linkToken),
  });
});
