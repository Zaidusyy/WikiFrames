// Platform-seeded content: roles (§12.1), the artifact library (ED-5), default
// canvas templates (T2) and standard event presets (§8.1 "Event Templates").
//
// Everything here is original artwork/copy. Per §23 we deliberately ship
// wiki-*inspired* motifs and never the trademarked puzzle globe or wordmarks.

export const SEEDED_ROLES = [
  { label: 'Wiki Developer', icon: '💻' },
  { label: 'Commons Photographer', icon: '📷' },
  { label: 'Wikipedia Editor', icon: '✏️' },
  { label: 'Open Knowledge Advocate', icon: '🌍' },
  { label: 'Wiki Educator', icon: '🎓' },
  { label: 'WikiClubTech Envoy', icon: '🚀' },
  { label: 'WikiClubTech Member', icon: '🤝' },
  { label: 'AI & Wikimedia Innovator', icon: '🤖' },
  { label: 'Heritage Documenter', icon: '🏛️' },
  { label: 'Knowledge Curator', icon: '📚' },
  { label: 'Future Wikimedian', icon: '🌱' },
];

export function badgeTextFor(role) {
  if (!role) return '';
  const icon = role.icon ? ` ${role.icon}` : '';
  return `I'm a ${role.label}${icon}`;
}

export const WIKI_PALETTE = [
  '#3366cc',
  '#2a4b8d',
  '#00af89',
  '#ffcc33',
  '#d73333',
  '#6b4ba1',
  '#202122',
  '#54595d',
  '#c8ccd1',
  '#ffffff',
];

// ED-5: open-licensed decorative elements, authored inline as SVG so the editor
// has no external asset dependency and artifacts stay recolorable.
export const ARTIFACTS = [
  {
    key: 'star',
    name: 'Star',
    tags: ['award', 'celebrate'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M50 5l13 30 33 3-25 22 8 32-29-17-29 17 8-32L4 38l33-3z"/></svg>',
  },
  {
    key: 'ribbon',
    name: 'Ribbon',
    tags: ['badge', 'award'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="38" r="28" fill="CURRENT"/><path fill="CURRENT" d="M32 62l-10 33 28-14 28 14-10-33z" opacity=".8"/></svg>',
  },
  {
    key: 'laurel',
    name: 'Laurel',
    tags: ['award', 'honour'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="CURRENT" stroke-width="6" d="M28 15c-16 18-16 52 0 70M72 15c16 18 16 52 0 70"/></svg>',
  },
  {
    key: 'bracket',
    name: 'Brackets',
    tags: ['code', 'developer'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="CURRENT" stroke-width="8" stroke-linecap="round" d="M35 20L15 50l20 30M65 20l20 30-20 30"/></svg>',
  },
  {
    key: 'book',
    name: 'Open book',
    tags: ['knowledge', 'library'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M8 22c14-6 28-6 42 2v54c-14-8-28-8-42-2zm84 0c-14-6-28-6-42 2v54c14-8 28-8 42-2z"/></svg>',
  },
  {
    key: 'globe-lines',
    name: 'Globe (original)',
    tags: ['world', 'open'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="38" fill="none" stroke="CURRENT" stroke-width="5"/><ellipse cx="50" cy="50" rx="16" ry="38" fill="none" stroke="CURRENT" stroke-width="5"/><path d="M12 50h76M20 30h60M20 70h60" stroke="CURRENT" stroke-width="5" fill="none"/></svg>',
  },
  {
    key: 'speech',
    name: 'Speech bubble',
    tags: ['talk', 'community'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M10 18h80v52H46L24 88V70H10z"/></svg>',
  },
  {
    key: 'confetti',
    name: 'Confetti',
    tags: ['party', 'celebrate'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="CURRENT"><rect x="12" y="16" width="10" height="10" rx="2"/><rect x="70" y="24" width="8" height="8" rx="2" transform="rotate(20 74 28)"/><rect x="40" y="8" width="7" height="7" rx="2" transform="rotate(35 43 11)"/><rect x="24" y="62" width="9" height="9" rx="2" transform="rotate(-15 28 66)"/><rect x="76" y="66" width="10" height="10" rx="2" transform="rotate(30 81 71)"/></g></svg>',
  },
  {
    key: 'camera',
    name: 'Camera',
    tags: ['commons', 'photo'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M12 28h18l6-9h28l6 9h18v46H12z"/><circle cx="50" cy="50" r="14" fill="#fff"/></svg>',
  },
  {
    key: 'pin',
    name: 'Map pin',
    tags: ['heritage', 'place'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M50 6c-16 0-28 12-28 28 0 21 28 60 28 60s28-39 28-60c0-16-12-28-28-28z"/><circle cx="50" cy="34" r="11" fill="#fff"/></svg>',
  },
  {
    key: 'sparkle',
    name: 'Sparkle',
    tags: ['ai', 'magic'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M50 8l9 28 28 9-28 9-9 28-9-28-28-9 28-9z"/></svg>',
  },
  {
    key: 'heart',
    name: 'Heart',
    tags: ['love', 'community'],
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="CURRENT" d="M50 86S12 62 12 38a20 20 0 0138-10 20 20 0 0138 10c0 24-38 48-38 48z"/></svg>',
  },
];

export function artifactSvg(key, color = '#3366cc') {
  const artifact = ARTIFACTS.find((a) => a.key === key);
  if (!artifact) return null;
  return artifact.svg.replaceAll('CURRENT', color);
}

// T2: the 6 default editable canvas templates the editor opens with.
export const DEFAULT_TEMPLATES = [
  {
    key: 'celebration-square',
    name: 'Celebration — Square',
    aspectRatio: '1:1',
    background: '#3366cc',
    accent: '#ffcc33',
    headline: 'I am attending',
    cutout: { shape: 'circle', xPct: 0.5, yPct: 0.4, sizePct: 0.5 },
    badge: { xPct: 0.5, yPct: 0.84, fontPct: 0.045, background: '#ffcc33', color: '#202122' },
    artifacts: ['confetti', 'star'],
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
    artifacts: ['globe-lines', 'sparkle'],
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
    artifacts: ['bracket', 'book'],
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
    artifacts: ['pin', 'camera'],
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
    artifacts: ['speech', 'heart'],
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
    artifacts: ['ribbon', 'laurel'],
  },
];

// §8.1 Event Templates → one click pre-fills a campaign draft.
export const EVENT_PRESETS = [
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

// Seeded autocomplete for the onboarding "user group" field (§7 step 1).
export const KNOWN_USER_GROUPS = [
  'Wikimedia Foundation',
  'Wiki Club Tech',
  'Wikimedia India',
  'Wikimedia Bangladesh',
  'Wikimedia Deutschland',
  'Wikimedia UK',
  'Wikimedia Nigeria',
  'Wikimedia Kenya',
  'Wikimedia Argentina',
  'Wikimedia Indonesia',
  'Wikimedia Taiwan',
  'Wikimedia Ghana',
  'Wikimedia Community User Group Malaysia',
  'Punjabi Wikimedians',
  'Tamil Wikimedians',
  'Telugu Wikimedians',
  'Marathi Wikimedians',
  'West Bengal Wikimedians',
  'Karnataka Wikimedians',
  'Wikimedians of Kerala',
  'Wikimedians of Nepal',
  'Wikimedians of Sri Lanka',
  'Christian Medical College Vellore Wikimedians',
];
