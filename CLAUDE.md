# CIPS Site LIVE: notes for Claude

Public website of Channel Island Port Services (cips.agency). **Read `HANDOVER.md` first** (state, map of the site, the journey in detail, how to test, editing traps, open jobs), then `README.md` for the branches and the folders. Keep `HANDOVER.md` true: when something it says changes, fix it in the same turn.

## Who and how
- Simon Porritt (MD) is not a developer. Explain choices briefly and plainly; show him what you built before moving on.
- Work on branch `dev`. **`main` is Live and only changes by a deliberate release, when Simon says so.**
- **Never push without Simon saying "push".** Commit locally as you go; end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Confirm before anything outward-facing (pushing, deploying, releasing, emailing, changing Airtable).
- In copy, do not call a ship "her"; say the ship, the yacht, Kinship. Use they/them for anyone whose pronouns are unstated.
- Simon views only locally (`Open CIPS Site LIVE (Windows).bat`, `http://localhost:8080`); never give him Vercel or preview links, never cite Howard's branches or URLs.
- Never edit Howard's lab (`CIPS-TAG/CIPS/HLC-globe-lab`); reading is fine. Lucas Freight is a separate, confidential project: keep its files, names and terms out of this repo.
- Do not kill processes by id; stop only servers you started. Never message another session without Simon's say-so. Only `git add` specific files.
- Verify in a browser and say plainly what you could not check. Before listing "what is left", check the claim in the code and `git log`.
- Editing traps: `globe-live/beat.js`, `live.js`, `beat.html`, `flights.js` are CRLF and `index.html`, `globe-enhancements.js`, `quay-work.js` are LF; never `sed -i` (it strips CRs), patch with Python bytes; write long scripts to a file, not a heredoc. More in `HANDOVER.md` section 7.

## The rules of this repo
- `site/` is everything public and **must be self-contained: no request to any outside server** (no CDNs, fonts, tiles, images, APIs, analytics). The one allowed exception is the CIPS review drop box address in `site/review/config.js`. Links people click are fine.
- No `../` paths out of `site/`; no files the pages do not use (no notes, tools, backups, old versions); every file under 24 MiB.
- The globe shows **no ships and no flights, and no AIS / flights pills** (4 Nov 2026, Simon: switched off, we may bring them back). The switch is `TRAFFIC: false` in the `options.ais` of `site/index.html` (read in `_beats/globe-live/live.js`); set it to `true` to bring back the simulated fleet, the simulated flights and both pills. They are simulated either way (`window.CIPS_LIVE_DATA = false`): never describe them as live.
- After changes: `cd tools && npm run tailwind` if classes changed, then `node check.mjs` (about 15 minutes for everything; flags `--desktop --phone --pages --doors`). It must report no missing files, no errors, nothing outside.
- Verify in a browser before saying something works (headless Chrome via the check, or the browser pane).

## Related things that live elsewhere
- `CIPS-TAG` (folder next to this one, branch `simon/dev`) is the lab and the old working site with live ships. Do not edit `HLC-globe-lab` there (Howard's). This repo was seeded from it on 4 Nov 2026 and now diverges on purpose.
- Reviews: the captain's review page is `site/review/`. Its answers go to the review drop box (Cloudflare Worker, code and README in `review-drop-box/` in this repo, copied from CIPS-TAG on 5 Nov 2026; work on this copy, not the CIPS-TAG one; it is outside `site/` and never published with the site), and the CIPS Desk (a separate project on Render) collects them. Design: `CIPS-TAG/CIPS/DOCS/SPEC-reviews.md`.
- Hosting plan (Simon, 5 Nov 2026): Cloudflare Pages (output directory `site`, no build command), production branch `main` only, first at its own `<project>.pages.dev` address (unlisted, noindex, optionally behind Cloudflare Access), wired to cips.agency later when Simon goes public. Preview deployments off: `dev` is never published, it is checked locally. Never move nameservers or touch email DNS records.

## The visitor's vessel (done 4 Nov 2026)
`site/js/vessel.js` holds where the visitor is sailing from (Mediterranean = Monaco, Northern Europe = Rotterdam, Caribbean = St Maarten; Mediterranean default) and an optional vessel name (Kinship default), kept for the session, announced on `window` as a `cips:vessel` event. The globe's chooser panel (`site/js/globe-enhancements.js`, `arrangeDeparture`) sets it; the globe (`_beats/globe-live/beat.js`, `syncVesselFields`) replans the demo vessel's route and card title from it; the chart scene's tag, the enquiry form's vessel field and the arrival mini-game (`_beats/seaway-wake/game.js`, `YACHT`: the pilot, Coastguard and VTS use the name, and the vessel is "under way from" the chosen port) read it. The berthing and hold-the-line games never named the vessel, so nothing was needed there. "Observe the Channel Islands" and the ship list are gone (hidden, not deleted: the picker code still exists behind them).

The picker carries a **preview of the journey card** (title, "N nm from <place>", destination, what for, speed, ETA) under the choices; it opens on the Mediterranean and follows each choice and the name. Its numbers come from the route the globe plans: `beat.js` (`publishKinRoute`) puts them on `CIPS_VESSEL.route` and fires `cips:route`; the real voyage card in the panel uses the same route (ETA counts down along it). Choosing a departure, or opening the picker, turns the globe to it (`focusOn`); once the journey is under way `tick()` keeps the globe turned to the vessel all the way (as it already did for a routed ship). "Scroll to start the journey" (the first scroll presses it) folds the picker away (`.voyage-mode`) and leaves the card with "Scroll to continue".

## Open items (5 Nov 2026)
- GitHub repo `CIPS-SP/CIPS_SITE_LIVE` (private): `dev` and `main` are both on GitHub (`dev` last pushed 5 Nov with the 5 Nov journey changes; `main` released 5 Nov, same as `dev` including `review-drop-box/`). Push again only when Simon says push. Cloudflare Pages project `cipslive` is live at https://cipslive.pages.dev (5 Nov; builds `main`, previews off, noindex), so every release to `main` goes online there. cips.agency is not connected yet.
- Deploy the review drop box and set `site/review/config.js`.

## The quay and the finale (4 Nov 2026)
- Quay: the Washdown call-out fades about a second after the spray starts (`quay-work.js`, `putTag('D', ...)`); the camera's pan onto the quay finishes by q = 0.17 (`beat.js`, `wq`) so the brow's landward end is in frame when tanker A's second driver reaches it.
- Finale (changed 5 Nov 2026): while the "Leaving St Helier" film is scrubbed by the scroll (pz 2.20 to 2.62) the plotter's ship waits where each shot is taken and only creeps a little, jumping at each cut (it no longer runs along the line between shots). `FILM_SHOTS` in `site/_beats/st-helier-approach/beat.js` (film seconds from/to, nm along the way out, knots); SOG 3.0 kn in the harbour, 5.0 kn from the Small Roads on. `exitSync:false` switches it off.
- Video windows (5 Nov 2026): Enlarge carries to the next clip in any scene; `loops: n` on a moment stops it after n plays until clicked (the quay clip has 2).
