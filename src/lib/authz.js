import { prisma } from './db';
import { forbidden, notFound } from './api';

// SEC-7: one place decides owner / co-team / super-admin access so no endpoint
// can accidentally skip the check.

export const ACCESS = { OWNER: 'owner', CO_TEAM: 'co_team', SUPER_ADMIN: 'super_admin' };

export async function loadCampaignFor(user, campaignId, { include } = {}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, deletedAt: null },
    include,
  });
  if (!campaign) throw notFound('Campaign not found');

  if (campaign.ownerId === user.id) return { campaign, access: ACCESS.OWNER };
  if (user.role === 'super_admin') return { campaign, access: ACCESS.SUPER_ADMIN };

  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.id } },
  });
  if (member) return { campaign, access: ACCESS.CO_TEAM };

  throw notFound('Campaign not found');
}

/** CAMP/DASH rules: co-team members edit content but never destroy a campaign. */
export function assertCanDelete(access) {
  if (access === ACCESS.CO_TEAM) {
    throw forbidden('Co-team members cannot delete or cancel a campaign.');
  }
}

export async function assertOwnsTemplate(user, templateId) {
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
    });
    if (member) return template;
  }
  throw notFound('Template not found');
}
