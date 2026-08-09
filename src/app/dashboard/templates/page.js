import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { assetUrl } from '@/lib/storage';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Templates' };

// §8.1 Templates: the organizer's library. CAMP-4 — these are assets, not
// campaign property, so anything here can be reused by any future event.
export default async function TemplateLibraryPage() {
  const user = await requireUser();

  const templates = await prisma.template.findMany({
    where: { OR: [{ ownerId: user.id }, { source: 'platform_default' }] },
    orderBy: { updatedAt: 'desc' },
    include: { campaign: { select: { id: true, name: true } } },
  });

  const library = templates.filter((t) => !t.campaignId);
  const attached = templates.filter((t) => t.campaignId);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Templates</h1>
        <p className="mt-1 text-sm text-wiki-slate">
          Everything you have designed or uploaded. A template built for one event can be reused in
          any other — that is the point of keeping them here.
        </p>
      </header>

      <Group
        title="Library"
        empty="Nothing in your library yet. Templates you detach from a campaign land here, ready to reuse."
        templates={library}
      />

      <Group
        title="Attached to a campaign"
        empty="No templates are attached to a campaign right now."
        templates={attached}
      />

      <div className="wf-note">
        Want to design a frame in Canva or Figma instead? Open any template, hit{' '}
        <strong>⬇ Download</strong>, and you get the frame PNG with the cutout punched out plus a
        spec sheet of the exact measurements. Design around the hole, then upload it back.
      </div>
    </div>
  );
}

function Group({ title, templates, empty }) {
  return (
    <section>
      <h2 className="font-serif text-xl">
        {title} <span className="text-base font-normal text-wiki-slate">({templates.length})</span>
      </h2>

      {templates.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-wiki-line p-6 text-sm text-wiki-slate">
          {empty}
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((template) => (
            <li key={template.id} className="wf-card flex flex-col gap-3 p-4">
              <div className="wf-checker flex h-36 items-center justify-center rounded-lg border border-wiki-line">
                {template.frameAssetId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(template.frameAssetId)}
                    alt=""
                    className="max-h-32 object-contain"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-xs text-wiki-slate">No preview yet</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate font-semibold">{template.name}</p>
                <p className="text-xs text-wiki-slate">
                  {template.aspectRatio} · {template.source.replace('_', ' ')}
                </p>
                {template.campaign ? (
                  <Link
                    href={`/dashboard/campaigns/${template.campaign.id}`}
                    className="mt-1 block truncate text-xs text-wiki-blue hover:underline"
                  >
                    {template.campaign.name}
                  </Link>
                ) : null}
                <p className="mt-1 text-[11px] text-wiki-slate">
                  Updated {formatDate(template.updatedAt)}
                </p>
              </div>

              {/* ED-11: the two prominent export buttons, on every card. */}
              <div className="mt-auto grid grid-cols-2 gap-2">
                <a
                  href={`/api/v1/templates/${template.id}/download`}
                  className="wf-btn-secondary justify-center px-2 py-2 text-xs"
                >
                  ⬇ Download
                </a>
                <Link
                  href={`/dashboard/templates/${template.id}/editor`}
                  className="wf-btn-primary justify-center px-2 py-2 text-xs"
                >
                  ✍ Write / Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
