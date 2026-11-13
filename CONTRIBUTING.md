# Contributing to WikiFrames

Thank you for helping! WikiFrames is built by and for volunteer communities —
code, design, translations, documentation and bug reports are all welcome.

## Ground rules

- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Privacy first.** Participants never need an account, and nothing is
  collected about them. A change that stores more about people needs a very
  good reason and a discussion first.
- **Wikimedia look and feel.** Interface work uses the Codex-aligned tokens in
  `tailwind.config.js`, the components in `src/components/ui.jsx` and the Codex
  icons in `src/components/Icon.jsx`. No emoji as interface icons, no Wikimedia
  logos or other trademarks.
- Security problems go to [SECURITY.md](SECURITY.md), not to public issues.

## Getting started

Requirements: Node.js 20.9 – 24 (an LTS release). Nothing else.

```bash
npm install
cp .env.example .env
npm run dev:db          # PostgreSQL in WebAssembly, leave it running
npm run db:push && npm run db:seed
npm run dev             # http://localhost:3000
```

Sign in without an OAuth consumer at
`http://localhost:3000/api/v1/auth/dev?username=DevOrganizer`.

## Before you open a pull request

```bash
npm run lint      # ESLint (next/core-web-vitals)
npm test          # unit tests — node:test, no extra tooling
npm run build
```

- Keep pull requests focused, and describe how you tested.
- Add or update tests for logic in `src/lib/` (geometry, validation,
  compositing, the editor's health check and magic resize are all pure and
  easy to test — see `tests/`).
- If you change dependencies, run `npm run licenses` and commit the updated
  `THIRD_PARTY_NOTICES.md`. Only permissive, MIT-compatible licences are
  accepted in the production tree.
- Commit messages: an imperative subject under 72 characters, then a short
  body explaining why.

## Project map

| Path | What lives there |
|---|---|
| `src/lib/geometry.js` | Frame geometry shared by every renderer |
| `src/lib/composite.js` | Server compositor (sharp) |
| `src/lib/compose-client.js` | On-device compositor (canvas) |
| `src/lib/editor/` | Pure editor logic: health check, magic resize, contrast |
| `src/components/editor/` | The canvas editor (Fabric.js) |
| `src/components/ParticipantFlow.jsx` | What participants use |
| `src/app/api/v1/` | REST API |
| `src/lib/validate.js`, `uploads.js`, `api.js` | Input validation and request guards |

## Licensing of contributions

WikiFrames is MIT licensed. By contributing you agree that your contribution
is released under the same licence, and that you have the right to submit it.
Artwork must be your own or openly licensed (with attribution recorded).
