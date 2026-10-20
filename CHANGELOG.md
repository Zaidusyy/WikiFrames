# Changelog

All notable changes to WikiFrames. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-10-20

### Added
- **On-device private rendering.** Participants who do not share their image
  with the gallery get it composed in their own browser; the photo is never
  uploaded. The live preview is drawn by the same compositor (WYSIWYG), with
  pinch and wheel zoom and keyboard panning.
- **Wikimedia Commons media library** in the editor, with licence and author
  recorded on every imported image, credits shown to participants, and image
  upload, paste and drag-and-drop.
- **Magic resize**: one design re-laid out for every other aspect ratio.
- **Smart guides and snapping** (layers, frame edges and centre, safe margin),
  alignment and distribution, groups, copy/paste, rotation snapping and a
  keyboard shortcut reference.
- **Frame Health Check**: WCAG 2.1 contrast, legible text size, safe areas,
  story-UI zones, badge-over-photo, blurry images and licence credits, with
  one-click fixes; results feed the campaign's launch checklist.
- Platform safe-zone overlays; a preview using the participant compositor.
- Automatic detection of the photo hole in uploaded and Commons frames.
- Venue access codes are checked before the flow starts and gate the frames.
- Alt text and Mastodon/Bluesky share targets on the result screen.
- `/licences` page, `THIRD_PARTY_NOTICES.md` and a licence checker.
- Docker image, Compose stack, `/api/v1/health`, CI, Dependabot, security
  policy, contributing guide and code of conduct.
- In-process retention scheduler, so purges happen even without cron.

### Changed
- Interface aligned with Codex, the Wikimedia Design System: tokens, 2px
  corners, Codex icons instead of emoji, Codex-style dialogs instead of
  browser `confirm()`/`prompt()`.
- Server compositing rewritten: about 6× faster, JPEG output about 4× smaller,
  frames cached between participants.
- Gallery ZIP export streams with backpressure and stops when the download is
  cancelled.
- Editor renders at display resolution with Fabric's zoom (crisper, faster,
  touch-sized handles).
- Upgraded Next.js 15.5.27, sharp 0.35.5 and Fabric.js 7.4.0 (security fixes).

### Fixed
- About 28% of participant links returned 404, because link tokens containing
  `-` were split incorrectly.
- Saving a finished (uploaded or Commons) frame in the editor replaced it
  with a blank design; the original artwork is now kept as a protected base.
- Badge colours from starter templates were lost on the first save.
- The editor's style panel lost its text controls after the first change, and
  autosave could save a stale template name.
- A blank first caption left a campaign with no mandatory caption.
- Analytics share breakdown under-counted beyond 5 000 events.
- "Featured groups on the wall" counted every user.
- Telegram share link.

### Security
- Participant images are no longer readable by anyone holding their URL:
  campaign team, public gallery or a short-lived signed link only.
- Rate limits can no longer be bypassed with a forged `X-Forwarded-For`;
  access-code guessing is throttled per address and per campaign.
- SVG uploads are rasterised; uploads are decoded under a pixel budget;
  request bodies are size-capped; template JSON and placement data are
  validated before use.
- OAuth profiles without a central user id are refused; super-admin rights
  follow `SUPER_ADMIN_USERNAMES` in both directions.
- Content-Security-Policy, Permissions-Policy, COOP, `__Host-` cookies and
  Fetch-Metadata CSRF checks.
- Wall entries return to moderation when their name, link or logo changes;
  user page links must be on a real Wikimedia domain.
- Deleting stored images can no longer silently orphan files.
- Removed a Windows-only dev dependency that broke installs on Linux/macOS.

## [0.1.0] — 2026-08-09

- First version: campaigns, canvas editor, participant flow, galleries,
  retention job.
