import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const roles = await prisma.campaignRole.findMany({
    where: { campaignId: campaign.id },
    orderBy: { sort: 'asc' },
  });
  return ok({ roles });
});

/**
 * §12.1 wizard step 3 — replace-all.
 *
 * Roles are "a variable, per-campaign thing": whatever the admin enables is
 * exactly what participants see. Replace-all matches how the form behaves and
 * avoids a diffing dance, but it must preserve the ids of roles that survive,
 * otherwise every already-generated image would lose its role attribution.
 */
export const PUT = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);

  const { roles } = await req.json();
  if (!Array.isArray(roles)) throw badRequest('Expected a list of roles.');
  if (roles.length > 40) throw badRequest('A campaign can offer at most 40 roles.');

  const cleaned = roles
    .map((r, i) => ({
      id: r.id || null,
      label: String(r.label || '').trim().slice(0, 30),
      icon: r.icon ? String(r.icon).slice(0, 8) : null,
      sort: i,
    }))
    .filter((r) => r.label);

  const existing = await prisma.campaignRole.findMany({ where: { campaignId: campaign.id } });
  const keepIds = new Set(cleaned.map((r) => r.id).filter(Boolean));

  await prisma.$transaction(async (tx) => {
    const removed = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
    if (removed.length) {
      await tx.campaignRole.deleteMany({ where: { id: { in: removed } } });
    }
    for (const role of cleaned) {
      if (role.id && existing.some((e) => e.id === role.id)) {
        await tx.campaignRole.update({
          where: { id: role.id },
          data: { label: role.label, icon: role.icon, sort: role.sort },
        });
      } else {
        await tx.campaignRole.create({
          data: {
            campaignId: campaign.id,
            label: role.label,
            icon: role.icon,
            sort: role.sort,
          },
        });
      }
    }
  });

  const saved = await prisma.campaignRole.findMany({
    where: { campaignId: campaign.id },
    orderBy: { sort: 'asc' },
  });
  return ok({ roles: saved });
});
