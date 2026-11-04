# CIPS Site LIVE: notes for Claude

Public website of Channel Island Port Services (cips.agency). Read `README.md` first for the branches and the folders.

## Who and how
- Simon Porritt (MD) is not a developer. Explain choices briefly and plainly; show him what you built before moving on.
- Work on branch `dev`. **`main` is Live and only changes by a deliberate release, when Simon says so.**
- **Never push without Simon saying "push".** Commit locally as you go; end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Confirm before anything outward-facing (pushing, deploying, releasing, emailing, changing Airtable).
- In copy, do not call a ship "her"; say the ship, the yacht, Kinship.

## The rules of this repo
- `site/` is everything public and **must be self-contained: no request to any outside server** (no CDNs, fonts, tiles, images, APIs, analytics). The one allowed exception is the CIPS review drop box address in `site/review/config.js`. Links people click are fine.
- No `../` paths out of `site/`; no files the pages do not use (no notes, tools, backups, old versions); every file under 24 MiB.
- The globe's ships and flights are **simulated and labelled** (`window.CIPS_LIVE_DATA = false` in `site/index.html`). Never describe them as live.
- After changes: `cd tools && npm run tailwind` if classes changed, then `node check.mjs` (about 15 minutes for everything; flags `--desktop --phone --pages --doors`). It must report no missing files, no errors, nothing outside.
- Verify in a browser before saying something works (headless Chrome via the check, or the browser pane).

## Related things that live elsewhere
- `CIPS-TAG` (folder next to this one, branch `simon/dev`) is the lab and the old working site with live ships. Do not edit `HLC-globe-lab` there (Howard's). This repo was seeded from it on 4 Nov 2026 and now diverges on purpose.
- Reviews: the captain's review page is `site/review/`. Its answers go to the review drop box (Cloudflare Worker, code and README in `CIPS-TAG/CIPS/review-drop-box`), and the CIPS Desk (a separate project on Render) collects them. Design: `CIPS-TAG/CIPS/DOCS/SPEC-reviews.md`.
- Hosting plan: Cloudflare Pages (output directory `site`, no build command), `dev` previews at `dev.<project>.pages.dev`, `main` goes to cips.agency. Never move nameservers or touch email DNS records.

## Open items (4 Nov 2026)
- GitHub repo under CIPS_SP and the Cloudflare account/project (Simon to create).
- Replace the "Find your ship" panel and the globe card wording that says every vessel is live (decision pending: "Tell us your vessel" or a plain button).
- Deploy the review drop box and set `site/review/config.js`.
