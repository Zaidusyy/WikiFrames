# Security policy

WikiFrames handles people's faces. We treat security and privacy problems as
the most important bugs there are.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through
[GitHub security advisories](https://github.com/Zaidusyy/WikiFrames/security/advisories/new).
Include what you found, how to reproduce it, and what an attacker could do with
it. Never include real participants' photos, campaign links or deletion links.

You will get an acknowledgement within a few days. We will keep you informed,
fix the problem as quickly as we can, and credit you in the release notes
unless you prefer otherwise. Please give us a reasonable time to ship a fix
before publishing details.

## Supported versions

Security fixes go into the latest release on `main`. Operators of an instance
should update promptly.

## What WikiFrames promises, and how it is enforced

| Promise | Where it is enforced |
|---|---|
| A photo is not uploaded unless the participant shares the image with the gallery | `src/lib/compose-client.js`, `src/components/ParticipantFlow.jsx` |
| Stored images are deleted at most `RETENTION_DAYS` (≤ 30) after the event | `src/lib/retention.js` (in-process scheduler + cron endpoint) |
| Stored images are only visible to the campaign team, a public gallery, or the participant's signed link | `src/app/api/v1/assets/[id]/route.js`, `src/lib/signing.js` |
| No EXIF/GPS data survives | `src/lib/uploads.js`, `src/lib/composite.js`, canvas encoding on device |
| No IP address or identifier is stored for participants | `src/lib/api.js` (`clientIp` is used for rate limiting only) |
| Organizers sign in with Wikimedia OAuth only, identity scope | `src/lib/oauth.js`, `src/app/api/v1/auth/` |

## Hardening in place

- Session tokens are random and stored only as SHA-256 hashes, in `__Host-`
  cookies (HttpOnly, Secure, SameSite=Lax) over HTTPS.
- Every cookie-authenticated mutation checks Fetch Metadata and `Origin`
  (CSRF), and every request body is size-capped before it is read.
- Uploads are sniffed by magic bytes, decoded under a 64-megapixel budget,
  re-encoded, and SVG is rasterised — no uploaded markup is ever served.
- Template JSON is validated and normalised before it is stored or rendered;
  image layers may only reference WikiFrames' own assets.
- A strict Content-Security-Policy, `X-Frame-Options: DENY`, COOP and a
  Permissions-Policy that allows only the camera, only on this origin.
- Rate limits read the client address from the right of `X-Forwarded-For`
  (`TRUST_PROXY_HOPS`), so they cannot be bypassed with a forged header.
  Venue access codes are throttled per address and per campaign.
- Production refuses to start without HTTPS, OAuth credentials and
  `APP_SECRET`, and with the development sign-in enabled.

## Operating an instance safely

- Always run behind a reverse proxy that terminates TLS and sets
  `X-Forwarded-For`; set `TRUST_PROXY_HOPS` to the number of proxies.
- Generate `APP_SECRET` and `CRON_SECRET` with `openssl rand -base64 48`.
- Exclude the image storage from long-term backups, and on S3 set a lifecycle
  rule matching `RETENTION_DAYS` as a safety net.
- Keep dependencies current (`npm audit --omit=dev` is part of CI).

## Known, accepted advisories

`npm audit` (including development dependencies) reports issues in `braces`
and `postcss-selector-parser`, pulled in by Tailwind CSS 3. They are build-time
only, never process untrusted input, and are not shipped in the production
bundle.

`npm audit --omit=dev` reports two moderate advisories in `glob`
(GHSA-3g3m-2fjr-6pw4) and `minimatch` (GHSA-g3hv-75wg-m249), reached only
through `archiver`, the gallery ZIP export. WikiFrames adds files to the ZIP
from memory and never passes it a glob pattern or a path from a user, so
neither is reachable; they clear when `archiver` moves to the fixed
versions. CI fails on any high or critical advisory.
