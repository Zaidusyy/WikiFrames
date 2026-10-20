import { prisma } from './db';
import { forbidden, notFound } from './errors';

// SEC-7: one place decides owner / co-team / super-admin access so no endpoint
// can accidentally skip the check.

export const ACCESS = { OWNER: 'owner', CO_TEAM: 'co_team', SUPER_ADMIN: 'super_admin' };

/** The caller's level of access to a campaign, or null. Never throws. */
export async function campaignAccess(user, campaign) {
  if (!user || !campaign || campaign.deletedAt) return null;
  if (campaign.ownerId === user.id) return ACCESS.OWNER;
  if (user.role === 'super_admin') return ACCESS.SUPER_ADMIN;
  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
    select: { id: true },
  });
  return member ? ACCESS.CO_TEAM : null;
}

export async function loadCampaignFor(user, campaignId, { include } = {}) {
  if (typeof campaignId !== 'string' || campaignId.length > 64) throw notFound('Campaign not found');
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, deletedAt: null },
    include,
  });
  const access = await campaignAccess(user, campaign);
  // A campaign you cannot see is indistinguishable from one that does not exist.
  if (!access) throw notFound('Campaign not found');
  return { campaign, access };
}

/** CAMP/DASH rules: co-team members edit content but never destroy a campaign. */
export function assertCanDelete(access) {
  if (access === ACCESS.CO_TEAM) {
    throw forbidden('Co-team members cannot delete or cancel a campaign.');
  }
}

export async function assertOwnsTemplate(user, templateId) {
  if (typeof templateId !== 'string' || templateId.length > 64) throw notFound('Template not found');
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) throw notFound('Template not found');

  // Platform defaults are readable by everyone but editable by super admins only.
  if (!template.ownerId) {
    if (user.role !== 'super_admin') throw forbidden('Platform templates are read-only.');
    return template;
  }
  if (template.ownerId === user.id || user.role === 'super_admin') return template;

  if (template.campaignId) {
    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: template.campaignId, userId: user.id } },
      select: { id: true },
    });
    if (member) return template;
  }
  throw notFound('Template not found');
}
