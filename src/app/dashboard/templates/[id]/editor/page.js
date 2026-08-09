import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate } from '@/lib/authz';
import { prisma, serializable } from '@/lib/db';
import { assetUrl } from '@/lib/storage';
import CanvasEditor from '@/components/CanvasEditor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const user = await requireUser();
    const template = await assertOwnsTemplate(user, id);
    return { title: `Editing ${template.name}` };
  } catch {
    return { title: 'Template editor' };
  }
}

export default async function TemplateEditorPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  let template;
  try {
    template = await assertOwnsTemplate(user, id);
  } catch {
    notFound();
  }

  const campaign = template.campaignId
    ? await prisma.campaign.findUnique({
        where: { id: template.campaignId },
        select: { id: true, name: true },
      })
    : null;

  return (
    <CanvasEditor
      template={serializable({
        ...template,
        frameUrl: template.frameAssetId ? assetUrl(template.frameAssetId) : null,
      })}
      campaign={campaign}
    />
  );
}
