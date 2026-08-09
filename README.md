# WikiFrames

**Campaign frame & banner generator for the Wikimedia ecosystem.**

Wikimedia communities run hundreds of events a year, and almost none of that
energy reaches the world outside the movement. WikiFrames closes that gap: an
organizer creates a campaign with a custom photo frame, shares one link or QR
code, and every attendee walks away with a personalised, on-brand image they
actually want to post — in under a minute, with no account and no app.

> Every event is a story. Every attendee is a storyteller.

Built to a written product specification. Section references throughout the code
(`§14.1`, `RET-4`, `ED-3`) point back to that document, which is kept privately
rather than published here.

---

## What it does

**For organizers**

- Sign in with the Wikimedia account you already have — no new password, and
  WikiFrames never requests permission to edit any wiki.
- Create a campaign from scratch or from a ready-made event template
  (Wikipedia Day, Wiki Loves Monuments, edit-a-thon, WikiConference, WikiClub
  meetup, photo walk).
- Design frames in a canvas editor: movable photo cutouts, text, artwork,
  shapes, layers, undo/redo, arrow-key nudging, four aspect ratios.
- Or design in Canva/Figma instead — download the blank frame with its spec
  sheet, decorate around the hole, upload it back. Commons-hosted frames can be
  linked directly and keep their attribution.
- Offer roles ("Wikipedia Editor", "Heritage Documenter") that become a badge on
  the image and the first line of the caption.
- Get a secure link and a print-quality QR code. Pause, resume, clone, cancel.
- Watch the gallery fill up, download it as a ZIP, read privacy-respecting
  analytics.

**For participants**

- Open a link or scan a QR. No login, no account, no personal details.
- Pick a frame, pick a badge, upload or capture a photo, drag it into place.
- Decide whether the image may be stored — the box starts unticked.
- Download it, or share image + caption together into WhatsApp, Instagram, X,
  Telegram or wherever they post.

**The privacy promise**

> If you allow it, your generated image is stored so the event organizers can
> showcase it in the campaign gallery. **All stored images are kept for a maximum
> of 30 days after the event closes, then permanently deleted from our servers.**
> If you don't allow storage, your image is generated one-time for you to
> download and share — and nothing is saved on our side.

That is enforced in code (`src/lib/retention.js`), audited in the log, and
stated publicly at `/privacy`.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), JavaScript |
| UI | React 19 + Tailwind CSS |
| Canvas editor | Fabric.js 6 |
| Database | PostgreSQL via Prisma |
| Image pipeline | sharp (server-side compositing, EXIF stripping) |
| Object storage | Pluggable — local filesystem or any S3-compatible bucket |
| Auth | Wikimedia OAuth 2.0 (Meta-Wiki consumer), PKCE |
| QR | `qrcode`, PNG + print-quality SVG |

---

## Running it locally

**Prerequisites:** Node 18.17+. Nothing else — the database comes with it.

```bash
cd WikiFrames
npm install
cp .env.example .env          # the defaults work for local development

# 1. Database — real PostgreSQL, no install, no Docker.
#    Leave this running in its own terminal.
npm run dev:db                # listens on 5433, data in .pgdata/

# 2. Schema + platform content (event presets, default templates)
npm run db:push
npm run db:seed

# 3. Go
npm run dev                   # http://localhost:3000
```

`npm run dev:db` runs PGlite — real PostgreSQL compiled to WebAssembly — behind
a TCP socket speaking the genuine Postgres wire protocol, so Prisma talks to it
exactly as it would to a production database rather than to a SQLite stand-in
that would diverge on enums and JSONB.

**One caveat, and it will bite you otherwise:** PGlite is a single-threaded
engine and its socket server effectively serves one client at a time. Run
`db:push` and `db:seed` *before* `npm run dev`, and restart `dev:db` if a
command reports *"Can't reach database server"* — that message means the
previous client is still holding the slot, not that the server is down. For
anything with real concurrency, use a normal Postgres instead:

```bash
docker compose up -d     # Postgres on 5432
# then set DATABASE_URL="postgresql://wikiframes:wikiframes@localhost:5432/wikiframes?schema=public"
```

### Seeing it work without a Wikimedia account

With `ALLOW_DEV_LOGIN=true`, open
`http://localhost:3000/api/v1/auth/dev?username=DevOrganizer` to sign in, then
go through onboarding → **+ Create campaign** → pick the WikiConference event
template → add a template → **Launch**. The Links & QR panel gives you the
participant URL; open it on your phone (or in a second browser) to run the
attendee flow end to end.

`ALLOW_DEV_LOGIN=true` in `.env.example` enables a local sign-in shortcut at
`/api/v1/auth/dev?username=YourName`, so you can use the whole product before
registering an OAuth consumer. It refuses to run when `NODE_ENV=production`.

### Connecting real Wikimedia OAuth

1. Propose an OAuth 2.0 client at
   [Special:OAuthConsumerRegistration](https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2)
   on Meta-Wiki.
2. Callback URL: `<APP_BASE_URL>/api/v1/auth/wikimedia/callback`.
3. Grants: **basic identity only**. Do not request any editing right.
4. Put the client ID and secret in `.env`, remove `ALLOW_DEV_LOGIN`.

---

## The retention job

Stored images carry an expiry of *event end date + 30 days*. Something has to
act on that:

```bash
# One-off, or from cron / a systemd timer:
npm run purge

# Which drives, with CRON_SECRET as a bearer token:
POST /api/v1/cron/retention
```

Set a matching 30-day lifecycle rule on the storage bucket as a safety net. The
super-admin dashboard shows an **overdue purges** counter — if it is non-zero,
the promise is being broken and it should page someone.

---

## Project layout

```
prisma/schema.prisma          Database schema (PDR §19)
prisma/seed.js                Event presets + the six default templates
scripts/purge.js              Retention job runner

src/lib/                      Everything with a rule in it
  config.js                   Env, limits, aspect ratios, production assertions
  session.js  oauth.js        Wikimedia OAuth 2.0 + hashed-token sessions
  authz.js                    owner / co-team / super-admin matrix (SEC-7)
  campaigns.js                Lifecycle state machine, clone, retention dates
  composite.js                sharp pipeline: photo → cutout → frame → badge
  uploads.js                  MIME sniffing, SVG sanitizing, EXIF stripping
  commons.js                  Commons ingestion + attribution (UP-2)
  retention.js                The purge (RET-4)
  participant.js              The token-gated participant payload
  presets.js                  Roles, artifacts, templates, event presets

src/app/api/v1/               REST API (PDR §20)
src/app/                      Landing, onboarding, dashboard, participant flow
src/components/               UI, incl. CanvasEditor and ParticipantFlow
```

---

## Where this sits against the spec

Implemented: OAuth and sessions, onboarding, the CRM dashboard, campaign CRUD
and the full lifecycle, clone, links and QR with regeneration, the canvas editor,
the download → external design → re-upload loop, Commons ingestion, roles and
badges, captions and hashtags, the participant flow with camera capture, consent
and one-time generation, storage with hard deletion, the admin and public
galleries, ZIP export, analytics, the landing page and community wall with its
approval queue, and the retention job.

Not yet built, and named in the spec: internationalisation beyond English
(strings are inline, not extracted), automated NSFW moderation of uploads
(UP-4 — the report-and-remove path exists, the classifier does not), virus
scanning, and BullMQ-backed queued generation for burst load. The in-process
rate limiter (`src/lib/ratelimit.js`) is per-instance and needs to move to Redis
before the app is scaled horizontally.

---

## Licence & independence

Source under the MIT licence. All artwork, templates, icons and fonts shipped
with WikiFrames are original or openly licensed, with attribution.

WikiFrames is an independent tool built for the Wikimedia community. **It is not
endorsed by or affiliated with the Wikimedia Foundation.** The Wikimedia puzzle
globe, wordmarks and sister-project logos are trademarks of the Foundation and
are deliberately not used here — the default templates are wiki-*inspired*
originals. If the community adopts the tool, formal trademark permission can be
pursued through the Foundation's trademark policy.
