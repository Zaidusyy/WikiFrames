/**
 * Seeds the platform-provided content: the standard event presets (§8.1) and
 * the six default wiki-themed canvas templates (T2).
 *
 * Safe to run repeatedly — everything upserts on a stable key.
 */
require('../scripts/load-env')();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const EVENT_PRESETS = [
  {
    key: 'wikipedia-day',
    name: 'Wikipedia Day',
    blurb: 'Celebrate the birthday of the encyclopedia anyone can edit.',
    theme: { background: '#202122', accent: '#ffffff', template: 'celebration-square' },
    defaultCaptions: [
      {
        text: 'Celebrating Wikipedia Day with my community! Free knowledge belongs to everyone.',
        hashtags: '#WikipediaDay #Wikimedia #OpenKnowledge',
        isMandatory: true,
      },
      {
        text: 'Years of volunteers, millions of articles, one shared library for the world.',
        hashtags: '#WikipediaDay #FreeKnowledge',
        isMandatory: false,
      },
    ],
    defaultRoles: ['Wikipedia Editor', 'Knowledge Curator', 'Open Knowledge Advocate'],
  },
  {
    key: 'wiki-loves-monuments',
    name: 'Wiki Loves Monuments',
    blurb: 'The world’s largest photography competition, run by volunteers.',
    theme: { background: '#00af89', accent: '#ffcc33', template: 'heritage-landscape' },
    defaultCaptions: [
      {
        text: 'I am documenting my heritage for Wiki Loves Monuments — every photo keeps a story alive.',
        hashtags: '#WikiLovesMonuments #WLM #Commons',
        isMandatory: true,
      },
    ],
    defaultRoles: ['Heritage Documenter', 'Commons Photographer'],
  },
  {
    key: 'edit-a-thon',
    name: 'Edit-a-thon',
    blurb: 'A focused session where a community closes knowledge gaps together.',
    theme: { background: '#3366cc', accent: '#ffcc33', template: 'editor-desk' },
    defaultCaptions: [
      {
        text: 'Spending the day at an edit-a-thon, closing knowledge gaps one article at a time.',
        hashtags: '#EditAThon #Wikipedia #OpenKnowledge',
        isMandatory: true,
      },
    ],
    defaultRoles: ['Wikipedia Editor', 'Wiki Educator', 'Future Wikimedian'],
  },
  {
    key: 'wikiconference',
    name: 'WikiConference',
    blurb: 'The annual gathering of a movement community.',
    theme: { background: '#2a4b8d', accent: '#00af89', template: 'story-portrait' },
    defaultCaptions: [
      {
        text: 'I am attending WikiConference — meeting the people behind free knowledge!',
        hashtags: '#WikiConference #Wikimedia #OpenKnowledge',
        isMandatory: true,
      },
      {
        text: 'Three days of sessions, stories and new friends across the movement.',
        hashtags: '#WikiConference #Wikimedia',
        isMandatory: false,
      },
    ],
    defaultRoles: [
      'Wiki Developer',
      'Wikipedia Editor',
      'Commons Photographer',
      'Future Wikimedian',
    ],
  },
  {
    key: 'wikiclub-meetup',
    name: 'WikiClub Meetup',
    blurb: 'A campus or city club session — the movement’s grassroots.',
    theme: { background: '#6b4ba1', accent: '#ffffff', template: 'clubtech-square' },
    defaultCaptions: [
      {
        text: 'At my WikiClub meetup today — learning, editing and building in the open.',
        hashtags: '#WikiClubTech #Wikimedia #OpenKnowledge',
        isMandatory: true,
      },
    ],
    defaultRoles: ['WikiClubTech Member', 'WikiClubTech Envoy', 'Wiki Developer'],
  },
  {
    key: 'photo-walk',
    name: 'Photo Walk',
    blurb: 'A community walk that ends with freely licensed photos on Commons.',
    theme: { background: '#ffcc33', accent: '#202122', template: 'minimal-ribbon' },
    defaultCaptions: [
      {
        text: 'On a Commons photo walk today — every shot goes to the world under a free licence.',
        hashtags: '#PhotoWalk #WikimediaCommons #FreeLicense',
        isMandatory: true,
      },
    ],
    defaultRoles: ['Commons Photographer', 'Heritage Documenter'],
  },
];

const DEFAULT_TEMPLATES = [
  {
    key: 'celebration-square',
    name: 'Celebration — Square',
    aspectRatio: '1:1',
    background: '#3366cc',
    accent: '#ffcc33',
    headline: 'I am attending',
    cutout: { shape: 'circle', xPct: 0.5, yPct: 0.4, sizePct: 0.5 },
    badge: { xPct: 0.5, yPct: 0.84, fontPct: 0.045, background: '#ffcc33', color: '#202122' },
  },
  {
    key: 'story-portrait',
    name: 'Story — Portrait',
    aspectRatio: '9:16',
    background: '#2a4b8d',
    accent: '#00af89',
    headline: 'Free knowledge,\nshared by me',
    cutout: { shape: 'circle', xPct: 0.5, yPct: 0.36, sizePct: 0.62 },
    badge: { xPct: 0.5, yPct: 0.8, fontPct: 0.032, background: '#00af89', color: '#ffffff' },
  },
  {
    key: 'editor-desk',
    name: 'Editor Desk — Feed',
    aspectRatio: '4:5',
    background: '#f8f9fa',
    accent: '#3366cc',
    headline: 'Editing the world,\none article at a time',
    cutout: { shape: 'rounded', radius: 48, xPct: 0.5, yPct: 0.42, sizePct: 0.66 },
    badge: { xPct: 0.5, yPct: 0.85, fontPct: 0.038, background: '#3366cc', color: '#ffffff' },
  },
  {
    key: 'heritage-landscape',
    name: 'Heritage — Landscape',
    aspectRatio: '16:9',
    background: '#202122',
    accent: '#ffcc33',
    headline: 'Documenting heritage',
    cutout: { shape: 'circle', xPct: 0.28, yPct: 0.5, sizePct: 0.68 },
    badge: { xPct: 0.66, yPct: 0.74, fontPct: 0.05, background: '#ffcc33', color: '#202122' },
  },
  {
    key: 'clubtech-square',
    name: 'WikiClub Tech — Square',
    aspectRatio: '1:1',
    background: '#6b4ba1',
    accent: '#ffffff',
    headline: 'Our club builds\nopen knowledge',
    cutout: { shape: 'rounded', radius: 36, xPct: 0.5, yPct: 0.42, sizePct: 0.52 },
    badge: { xPct: 0.5, yPct: 0.85, fontPct: 0.044, background: '#ffffff', color: '#6b4ba1' },
  },
  {
    key: 'minimal-ribbon',
    name: 'Minimal Ribbon — Square',
    aspectRatio: '1:1',
    background: '#ffffff',
    accent: '#00af89',
    headline: 'Proud to take part',
    cutout: { shape: 'circle', xPct: 0.5, yPct: 0.44, sizePct: 0.58 },
    badge: { xPct: 0.5, yPct: 0.86, fontPct: 0.042, background: '#00af89', color: '#ffffff' },
  },
];

async function main() {
  for (const preset of EVENT_PRESETS) {
    await prisma.eventTemplatePreset.upsert({
      where: { key: preset.key },
      create: {
        key: preset.key,
        name: preset.name,
        blurb: preset.blurb,
        theme: preset.theme,
        defaultCaptions: preset.defaultCaptions,
        defaultRoles: preset.defaultRoles,
      },
      update: {
        name: preset.name,
        blurb: preset.blurb,
        theme: preset.theme,
        defaultCaptions: preset.defaultCaptions,
        defaultRoles: preset.defaultRoles,
      },
    });
  }
  console.log(`✓ ${EVENT_PRESETS.length} event presets`);

  // Platform templates have no owner, which is what marks them read-only for
  // organizers — they clone one to get an editable copy.
  for (const template of DEFAULT_TEMPLATES) {
    const existing = await prisma.template.findFirst({
      where: { source: 'platform_default', name: template.name },
    });
    const data = {
      name: template.name,
      source: 'platform_default',
      aspectRatio: template.aspectRatio,
      editable: true,
      canvasJson: {
        starter: template.key,
        background: template.background,
        accent: template.accent,
        headline: template.headline,
        cutout: template.cutout,
        badge: template.badge,
      },
    };
    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data });
    } else {
      await prisma.template.create({ data });
    }
  }
  console.log(`✓ ${DEFAULT_TEMPLATES.length} default templates`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
