# CIPS Site LIVE

> **Status: not released yet.** `main` holds no site until the first release. The site is being prepared on `dev`.

The public CIPS website (cips.agency): **only what the live site needs, self-contained, nothing borrowed from outside.**

## The two branches

| Branch | What it is | Where it shows |
|---|---|---|
| `dev` (Test/Dev) | Where the live site is **edited and previewed**. | Cloudflare gives it a stable preview address: `dev.<project>.pages.dev`. |
| `main` (Live) | What the public sees. **Only changed by a deliberate release.** | `cips.agency` |

A change is made on `dev`, checked at the preview address, and only then released to `main` (on Simon's say-so). Nothing reaches the public by accident.

## The folders

```
site/     everything that is published (Cloudflare Pages "build output directory" = site, no build command)
tools/    editing helpers, never published: the Tailwind compiler, the self-containment check
```

## Editing

1. Work on the `dev` branch. Edit files under `site/`.
2. If you add or change page classes (Tailwind), recompile the styles: `cd tools && npm install && npm run tailwind` (writes `site/css/tailwind.css`).
3. Run the check: `cd tools && node check.mjs`. It serves `site/` on its own, scrolls the whole journey (desktop and phone) and the other pages, and fails if anything is missing, throws an error, or asks anything outside the site for a file.
4. Commit and push `dev`; look at the preview address.
5. Release: merge `dev` into `main` (fast-forward). Only when told to.

## Rules that keep it self-contained

- **No outside addresses**: no CDN scripts, web fonts, map tiles, images, APIs or analytics. Everything the page loads sits in `site/`. (Links people click, such as WhatsApp or LinkedIn, are fine.) The one allowed exception is the CIPS review drop box, set in `site/review/config.js`.
- **Nothing is shared with other folders**: no `../` paths out of `site/`, no submodules, no copies pointing back at the old working repo.
- **No unnecessary files**: nothing in `site/` that the pages do not use. No backups, notes, tools, or old versions.
- **Files stay under 24 MiB** (Cloudflare Pages allows 25 MiB per file).
- Ships and flights on the globe are **simulated** and labelled as such (`window.CIPS_LIVE_DATA = false` in `site/index.html`; the live-feed code is not wired in).

## Where this came from

Built on 4 Nov 2026 from the CIPS working repo (`CIPS-TAG`, branch `simon/dev`, commit `e07c897`) by its go-live build script, then made the home of the public site. From here on this repo is edited directly; the working repo goes back to being the lab and the full site.

## Related

- Reviews: the hidden review page is `site/review/`; answers go to the CIPS review drop box (a small Cloudflare Worker, code in the working repo's `CIPS/review-drop-box`) and the CIPS Desk collects them. Design: `CIPS/DOCS/SPEC-reviews.md` in the working repo.
- The Desk is a separate project and is not part of this site.
