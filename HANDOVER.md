# CIPS Site LIVE: handover for a new Claude session

Written 5 Nov 2026 at the end of a long session, so a fresh session can carry on without the chat history.
Read this first, then `CLAUDE.md` (the short rules) and `README.md` (branches, folders, editing steps).
Everything here was checked against the code and `git log` on 5 Nov 2026. If the code and this file disagree, the code wins: fix the file in the same turn.

---

## 1. Where things stand (5 Nov 2026)

- **Repo:** `C:\Users\amity\GitHub\Code\CIPS-SITE-LIVE`. Branches: `dev` (Test/Dev, where all editing happens, checked out) and `main` (Live).
- **GitHub:** `origin` = https://github.com/CIPS-SP/CIPS_SITE_LIVE.git (private, created by Simon). Push only when Simon says "push" (no force).
- **First release 5 Nov (Simon said "release"):** `main` fast-forwarded to `64f7103` (the 5 Nov journey work and notes) and pushed, so Cloudflare has a site to publish. Commits after that (from `46a053f`, the review drop box folder) are on `dev` only.
- **Pushed 5 Nov (Simon said push):** `46eddb4` notes (hosting plan: `main` only on Cloudflare), `3dcd1a1` the 5 Nov journey changes (finale plotter waits at each shot, Enlarge carries over, quay clip pauses after two plays, globe chevron's first heading) and the notes commit after it. `git log origin/dev..dev` shows anything newer that is still local.
- **Earlier commits on `dev`, newest first:**
  - `f97c223` this handover note; CLAUDE.md standing rules
  - `55be5f1` quay: washdown tag fades 1 s after spraying; pan onto the quay faster; finale: plotter follows the yacht in the departure film
  - `65bcd17` ping at the departure while the picker is open; "Scroll to start the journey"
  - `17bbd80` journey-card preview in the picker; ships, flights and pills off; globe follows the chosen route
  - `15ee9e8` launch script (`Open CIPS Site LIVE (Windows).bat` and `tools/serve.mjs`)
  - (older: `a3681b3`, `b7e642b` departure chooser, `609a49f` CLAUDE.md, `b30aba7` baked map tiles, `2f8545c`, `1320578` seed from CIPS-TAG at `e07c897`, `b4590db` start of repo)
- **Not yet done (all need Simon's yes, none started):**
  1. (Done: both branches are on GitHub.)
  2. Cloudflare account (Simon set it up 5 Nov) and Pages project, connected to GitHub, Simon does the clicks (output dir `site`, no build command, production branch `main`, preview deployments None; `site/_headers` already sends noindex on any `*.pages.dev` address). **Plan agreed 5 Nov:** publish `main` only, first at its own `<project>.pages.dev` address (unlisted, noindex, optionally behind Cloudflare Access), then add cips.agency to the same project when Simon goes public. Preview deployments off: `dev` is never published, Simon checks it locally. Never move nameservers or touch email DNS.
  3. Deploy the review drop box (Cloudflare Worker, code now in this repo's `review-drop-box/`, copied from CIPS-TAG 5 Nov and tested end to end locally: 28 checks pass, the review page's answer reached the box and a stand-in Desk collected it) and set `REVIEW_API` in `site/review/config.js` (it is `''` now, which means "same address as the page", fine for local tests only).
  4. A short brief for the CIPS Desk session so it collects the reviews (Desk is a separate project on Render; only message another session with Simon's say-so).
- **The other repo** `C:\Users\amity\GitHub\Code\CIPS-TAG` (branch `simon/dev`) is ahead of its origin by **7 unpushed commits** (the go-live package commits, the revert, two changelog commits). It was reverted to its pre-package state (tag `package-work-4nov` keeps the package commits). It also has uncommitted changes to three `shots/board-*.jpg` and an untracked `plates-build/backup-before-quay-fix/` folder: leave them alone unless Simon asks.

## 2. Who Simon is and how to work with him

- **Simon Porritt**, MD of CIPS (Channel Island Port Services, Jersey superyacht port agency), simon@cips.agency. Not a developer. Howard Le Cornu is owner/founder and builds in his own lab (`HLC-globe-lab` in CIPS-TAG).
- Explain choices briefly and plainly; avoid unexplained jargon ("beat", "plate", "HUD"). He describes the outcome he wants; translate it into the change. He iterates by screenshot and wording ("move it to the green circle"), so make small changes and show close-ups.
- Show him what you built before moving on. Say plainly what you verified and what you could not (he cannot spot drift in notes; he has caught several).
- Style: mono-led marks with one blue accent (`#0080C0`); the page after the journey is "Quiet Render" (light, hairline grid, large light headlines, one gradient phrase).
- **Copy:** never call a ship "her"/"she". Say the ship, the yacht, Kinship. (Quoting Howard's existing strings is fine if flagged.) Use they/them for anyone whose pronouns are unstated. "VAT and duty free", never "tax-free". Berths up to 150 m (a maximum), floating pontoon up to 70 m.
- Interactive segments are named "Play the X" / "Take the helm" with an automated (scrolled) equivalent: the scroll story is the non-play version.

## 3. Hard rules (do not break)

1. **Never push without Simon saying "push".** Commit locally as you go. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (or the attribution line the session gives you). Only `git add` specific files.
2. **`main` is Live** and changes only by a deliberate release, on Simon's yes.
3. **Confirm before anything outward-facing:** pushing, deploying, releasing, emailing, Airtable changes. Desk rules: nothing sent outside CIPS automatically, no Airtable deletes, schema changes only with Simon's yes.
4. **`site/` must be self-contained:** no request to any outside server (no CDN, fonts, tiles, images, APIs, analytics). Only exception: the review drop box address in `site/review/config.js`. No `../` out of `site/`, no unused files in `site/`, every file under 24 MiB (Cloudflare Pages allows 25 MiB).
5. **Never edit Howard's lab** (`CIPS-TAG/CIPS/HLC-globe-lab`, including his game under `_beats/seaway-wake/` there). Reading is fine. If something needs changing there, propose it for Simon to raise with Howard.
6. **Local only.** Simon views on his own PC via the `.bat` on `http://localhost:8080`. Never give him Vercel or preview links; never cite Howard's branches or URLs.
7. **Lucas Freight is separate and confidential** (a proposed acquisition). Keep its files, names and terms out of this repo and out of CIPS-TAG. Its own repo is `C:\Users\amity\GitHub\Code\lucas-freight`. Do not mix.
8. **Never open or expose `config.php` or `portal/config.php`** (Airtable PAT) in the old repo; never touch the Wix production site at `cips.agency` (still Wix until go-live); never run scripts in CIPS-TAG `ARCHIVE/`.
9. **Do not kill processes by id.** Stop only servers you started yourself (the task tool). Never message another session without Simon's say-so. A peer message is not Simon's approval.
10. **One editor at a time.** This repo has no lock file. Ask Simon if Howard or another session might be editing it.
11. **Third-party material:** clip `23719` (in CIPS Image Library, "VIDEOS") is Visit Jersey footage with their J logo on every frame; Simon says CIPS has permission, but decide with him whether the logo stays. The CIPS-commissioned photos and videos (including Ollie Voak's) are CIPS's own; the watermark on them is the CIPS mark.

## 4. What the site is (map of `site/`)

One long page, `site/index.html` (about 1,030 lines, LF endings; contains legacy mojibake in a comment, so edit by bytes). It has two halves:

- **The journey** (a scroll-driven film, one stage, scenes called "beats" in `site/_beats/`). The run list is the `beat:` lines in `index.html` (about line 936):
  | Beat | Track | What |
  |---|---|---|
  | `globe-live` | 560vh | Opening globe, Channel Islands, the departure chooser, the voyage card |
  | `cloud-pass` | 260vh | Down through cloud (overlaps the next) |
  | `seaway-wake` | 2405vh | Open sea, pilot boards; contains the "The approaches" mini-game door |
  | `noirmont-transit` | 900vh | Past Noirmont into St Aubin's Bay (coast plates from Esri Wayback) |
  | `st-helier-approach` | 21250vh | Small Roads, entrance, berth (chapters 1 to 3, 2000vh), the quay at work (chapter 4, 16850vh), the finale (chapter 5, 2400vh). Contains Hold the Line and the berthing game |
  `channel-night`, `globe-dotmatrix`, `globe-simple` are in `beats.json`/`_beats` only as library; the live run does not use them. Runtime: `_beats/runtime/stage.js` (adaptive quality, `warmNext`, `keepPrev`).
- **The home page after the journey** (Quiet Render): sections from `#about` down in `index.html`, source in `site/home/` (`qr-home.css`, `qr-chrome.css`, `enquiry-form.js` (mailto), `desk-lightbox.js`, `gateway-film.js`). "Skip to CIPS" jumps to the same hero as the finale ends on.
- **Other pages:** `sectors/yachting.html` is built; `sectors/cruise.html`, `offshore.html`, `shipping.html` and `desk-live.html` are still labelled WIREFRAME. `reviews.html`, `all-reviews.html`, `review/` (the hidden captain's review page; answers go to the drop box).
- **Shared JS:** `site/js/vessel.js` (see 5), `globe-enhancements.js` (the departure chooser, `arrangeDeparture`), `ship-picker.mjs`, `voyage-prompt.mjs`, `scroll-momentum.js`, `dev-device.js`.
- **Shared beat modules:** `_beats/_shared/` (`nav-plotter.js` the chart plotter, `video-moment.js|css`, `twin-screw.js`, `bridge-console.js`, `st-helier-route.js`, `tilt-shift.js`, `sea-wake.js` …).
- **Media:** `site/videos/journey/journey-1..6-*.mp4` (720p, silent; clip 6 is the 1080p departure film, 15.4 s, 18.4 MB), `videos/gateway/` (the Atlantic Gateway film, 24 MB and a 15 MB 720p), `images/…`, fonts self-hosted (`fonts/OFL.txt`), map tiles baked into `_beats/globe-live/assets/tiles` (94 tiles, Esri World Imagery and NASA Black Marble; credits line in the page footer).
- **`tools/`** (never published): `serve.mjs` (local server), `check.mjs` (self-containment check), Tailwind (`npm run tailwind` after changing page classes), `bake-tiles.py`.
- **Not in this repo (left in CIPS-TAG):** the per-beat READMEs (e.g. `CIPS-TAG/CIPS/site/_beats/st-helier-approach/README.md`, the detailed record of the harbour chapters), `CIPS/DOCS/` (JOBS.md, CHANGELOG.md, SPEC-reviews.md, HANDLING-twin-screw.md, PLAN-clean-go-live.md, STORY-STYLE-next-chapters.md …), and the dev tools under `CIPS/site/_beats/tools/` (perf-run.js, plates-build, harbour-picker, video-picker, site-directions). Read them there; do not copy them into `site/`.

## 5. The journey in detail (what a new session needs to know)

**The visitor's vessel** (`window.CIPS_VESSEL`, `site/js/vessel.js`): departure = Mediterranean (Monaco, default), Northern Europe (Rotterdam) or Caribbean (St Maarten), plus an optional vessel name (default "Kinship"). Kept for the session, event `cips:vessel`; `.route` and event `cips:route` are published by `globe-live/beat.js` (`publishKinRoute`). Read by the globe, the chart tag, the enquiry form and the arrival mini-game.

**Opening globe** (`_beats/globe-live/beat.js`, `live.js`, `beat.html`):
- The picker opens on Monaco. A **journey card preview** sits under the choices (title, "N nm from <place>", destination, speed, ETA) following the choice and the name; numbers come from the planned route.
- **Chevron heading (5 Nov):** the Monaco route first runs 337° for about 12 nm (out of the port to the lane), then 247°; too short to see, so the chevron looked like it turned on the spot. `kinFwdAhead` (`KIN_LOOK_NM = 40`) points it along the route as it runs 40 nm on until it gets there, so it appears already on its track (Rotterdam and St Maarten are straight from the start anyway).
- Choosing a departure (or opening the picker) turns the globe to it (`focusOn`); the vessel **pings** (small, bright, time-based 1.5 s) at the departure at once. The button now reads **"Scroll to start the journey"**: the first scroll gesture presses it; the ping grows into the full chevron over 0.8 s; the picker folds away (`.voyage-mode`) leaving the card and "Scroll to continue". Once under way `tick()` keeps the globe turned to the vessel the whole way.
- **Ships, flights and both pills are switched off:** `TRAFFIC: false` in the `options.ais` of `index.html` (read in `live.js`). Set `true` to bring back the simulated fleet, simulated flights and the AIS/flights pills. They are simulated either way (`window.CIPS_LIVE_DATA = false`): never describe them as live. Live ships return as a later phase (Simon and Howard agreed 4 Nov that go-live is simulated-only; no aisstream key at go-live).

**St Helier approach** (`_beats/st-helier-approach/`): progress `p0` over the whole beat; `KB = 0.09412` is where chapter 4 starts; quay `q = (p0 − KB)/0.79294` (`quayTail`); finale `r = (p0 − KB − quayTail)/0.11294` (`finaleTail`); `pz = p + q + r`.
- Harbour facts: the berth is the Albert Pier east face, port side to, bow about 030°. The 078° Pier Head lead passes ~15 m south of the Albert Pier head, then turn to port. noirmont's `ROUTE[4]` (light A1604) is the mouth of Elizabeth Harbour, not the way to the berth. Chapters use true scale (the seaway game exaggerates the hull 2.6×).
- **Games:** Hold the Line (`hold-the-line.js`, door p 0.03 to 0.14) and the berthing game (`berth-game-ui.js`, `berth-game.js`, `berth-geo.js`, door p 0.710 to 0.901). Decisions: three stars (Alongside, Soft landing ≤0.3 kn first touch, Lines), Hold is under 3 kn only, a collision shows a card with Try again / Skip (the pilot does not take over), red edges before a would-be collision, pause card. The CAPTAIN does the manoeuvre; the pilot only advises. One shared console: twin levers linked by default, rudder bar stays where set, thrusters locked above 5.4 kn and unlock under 5.0. Handling numbers are estimates (`CFG` dials `windScale` 0.6, `setKn` 0.2): a yacht master or Howard should check them.
- **Chapter 4, the quay at work** (`quay-work.js`): tankers A and B, van, provisions man (two runs), fresh water, three garbage runs, fuel, one-man washdown, services card with call-outs; completion text "All services complete: vessel turned around, ready to rest or depart". Speeds are slowed (`PEOPLE` 2/3, `SLOW` 0.5); story length `TL.end` = 2842 s; the scroll track = pace 5.933 vh per story second × `TL.end`. **If story timings change:** read `TL.end` (`import('/_beats/st-helier-approach/quay-work.js').then(m=>m.TL.end)`), scale the quay track by new/old keeping chapters 1 to 3 at 2000vh, `quayTail = Q/(2000+Q)`, and update the run list in `index.html`. Test link: `?goto=st-helier-approach:<p>` with `p = 0.09412 + q*0.79294`, `q = T/2842.2`.
- **4 Nov changes:** the Washdown man's tag fades from `TL.wdS1[0]+3.5` over 0.6 s; the camera pan onto the quay finishes by q = 0.17 (`wq = smooth(0.0, 0.17, q)` in `beat.js`) so the brow's landward end is in frame when tanker A's second driver reaches it (not eyeballed live at the exact moment: Simon to check; tune 0.17 → 0.12 for earlier, up for gentler).
- **Chapter 5, the finale** (`finale.js`, `beat.js`): slow zoom-out, hard cut to the departure film `journey-6-departure.mp4` (15.4 s, full screen, scrolled by the page over pz 2.20 to 2.62 and auto-played from r 0.20 with click-to-pause), closing line "For your call at The Atlantic Gateway.", then the whole frame shrinks into the home hero panel (`has-finale` on html; identical still `images/home/journey-corbiere.jpg`). **Plotter sync (4 Nov, changed 5 Nov):** while the film plays the plotter's ship (`exitFix`) no longer runs along the line: per Simon it waits where each shot of the film is taken and only creeps a little, jumping at each cut. `FILM_SHOTS` in `beat.js` = [film s from, to, nm along `EXIT` at start and end, knots]; the cuts are 1.80, 2.84, 6.04, 7.96, 12.20 s (berth, overhead channel, inside the pier heads, just outside them, Small Roads overhead, open sea). SOG 3.0 kn in the harbour, 5.0 kn from the Small Roads on. Checked shot by shot in the browser pane 5 Nov. `o.exitSync:false` switches it off. **Not synced:** the arrival clips (journey-2 bay and Small Roads, journey-3 pier heads, journey-4 alongside); ask Simon if he wants these done.
- **Video moments** (`_shared/video-moment.js`, windows in each beat's `defaults.videoMoments`): footage stays up inside its window and goes when the visitor leaves it; click pauses; never during the games; no "Live" pill; keep windows long enough rather than looping past the end. Off switch `videoMoments:[]`. **5 Nov:** Enlarge/Smaller carries to the next clip, in any scene (`syncWide()` runs when a clip opens; each beat's box is built at load, so it could not know before). A moment can have `loops: n`: it stops on its last frame with the play button after n plays, and a click loops it on; the quay clip has `loops:2`.

**Performance** (target 60 fps at Simon's real screen: 1920×1080, Intel Iris Xe, Edge): things that move every frame must move by `transform` on a layer, never by repainting a big SVG or filter (the dashed leading lines were the Small Roads cost). Level 2 adaptive quality (no backdrop blur) gives 60 fps in the harbour. Still open: the quay `sq-lead` SVG, the ~2 s wide-plate erase at load (`wideWithout`), plate-chunk decode on the main thread, seaway-wake fps, the first warm step 130 ms to 1.2 s, and whether level 2 is the 1080p default (Simon's call). Method and tools are in CIPS-TAG (`perf-run.js`, `perf-profile.js`).

## 6. How to test (and the traps)

- **Look at it:** double-click `Open CIPS Site LIVE (Windows).bat` or `node tools/serve.mjs` (port 8080; `--port 8090`, `--no-open`). Bind is IPv6: use `localhost`, not `127.0.0.1`. No cache.
- **Checks:** `cd tools && npm run tailwind` if classes changed, then `node check.mjs` (about 15 minutes; flags `--desktop --phone --pages --doors`). It must report no missing files, no errors, nothing outside.
- **Verify in a browser before saying something works** (the browser pane or headless Chrome). Say what you could not check.
- **Handy URLs:** `?hud` (beat name and % bottom-left), `?goto=<beat>:<fraction>` (deep link), `?quality=0|2`, `?scale=`, `_beats/seaway-wake/game.html?fps&dev`.
- **Pane traps:** the page needs ~20 to 30 s to build ("Building the matrix…"); click the CTA only after it mounts. Page scroll tends to snap back in the finale, so verify by sampled readouts. `requestAnimationFrame` runs only while a pane action is in flight and not at all while the pane is hidden (use headless Chrome via CDP for anything that animates). Repeated mounts trigger Chrome's WebGL context block ("context loss and was blocked", falsely looks like a regression): wait 10 to 20 s, do not loop retries. Scripted scrolls need `behavior:'instant'` (the page has smooth scrolling). Close the pane's page and stray headless Chromes before timing.
- **After deleting code**, grep every identifier it leaves behind and click the neighbouring buttons (31 Oct: removing the "Take me in" ride left two calls to `stopRide()` that broke Skip to CIPS for a day).
- **Before listing "what is left", check the claim in the code and `git log`.** Notes go stale.

## 7. Editing traps (Windows, Git Bash)

- **Line endings:** `globe-live/beat.js`, `live.js`, `beat.html`, `flights.js` are **CRLF**; `index.html`, `globe-enhancements.js`, `quay-work.js` are **LF**. `sed -i` under Git Bash strips CRs and balloons the diff: don't. Patch with Python byte editing (read bytes, normalise, replace one unique anchor, write back with the file's own endings); a patch script should write only if every anchor matched exactly once. Example patch scripts from this session are in the old scratchpad and are not kept.
- Heredocs mangle backslashes: write long Python or JS scripts to a file with the Write tool.
- `index.html` has a mojibake comment: edit it by bytes.
- `beat.js` in st-helier keeps its own copy of the harbour constants that `berth-geo.js` mirrors: keep them in step.
- If `ROUTE` in `noirmont-transit/beat.js` changes, update `tools/plates-build/plan.js` (in CIPS-TAG) and rebuild the plates, or the camera can run off the sharp coverage. Plates come from **Esri Wayback release 64001 (2026-02-26)**, because live Esri is cloud-covered over the harbour at z17+.
- Only use `git add <specific files>`; never `-A`. Keep Lucas Freight files out of git.

## 8. Open jobs, in a sensible order

1. **Simon looks at 5 Nov work on his PC** (the quay pan and washdown tag were approved 5 Nov): the finale plotter waiting at each shot, Enlarge carrying over, the quay clip pausing after two plays, the globe chevron's first heading.
   - **Quay scroll: on hold** (5 Nov, Simon: "leave the scroll untouched for now"). Do not change it until he asks. Measured 5 Nov: only 59 of the 2,842 story seconds have nothing moving (25 s before tanker A, 14 s at the end, a few seconds between jobs). So the scroll can only get shorter at the same on-screen speeds by telling a shorter story: overlapping jobs that now run alone (113-587 s tanker A's crew and hose on their own; 2209-2828 s hose A coming back and tanker A leaving, mostly on their own), dropping a run (provisions or a garbage run), or shorter walks. Simon to choose.
2. **Cloudflare** account and project for `main` only (previews off), its `*.pages.dev` address first (noindex, optionally Cloudflare Access), later cips.agency (`www` by CNAME; apex needs Cloudflare DNS or a redirect).
3. **Drop box deploy + `REVIEW_API`** (code in `review-drop-box/`, see its README "Putting it live"; wrangler is not installed yet; first at its free workers.dev address, no DNS changes; `ALLOWED_ORIGINS` needs the `.pages.dev` address), then a short Desk brief.
4. **Plotter sync for the arrival clips** (if Simon wants it).
5. **Still wireframe:** Cruise, Offshore, Shipping sector pages; Desk LIVE. Open facts to confirm: Guernsey/Alderney wording, 160 m pontoon vs 70 m, ~130 m LOA, Portugal/Caribbean, clients we may name; proof numbers are `[X]` placeholders. Permission to show the associates' logos (ICS, British Superyacht, Superyacht Ready, Captain's Recommended Service, Water Taxi CI); a clean Atlantic Gateway logo; a bigger Water Taxi CI file.
6. **Quay leftovers:** the CIPS hamper photo (currently drawn placeholder art), the optional second tanker B run (to 35,000 L). Nothing watched end to end at scroll speed yet.
7. **Performance leftovers** (section 5), touch/tablet check (the Console is drag-driven, untried on a tablet), the handling-numbers check, phone-width check of the new header, footer and logo band.
8. **Credits and licences:** Esri imagery terms for the baked tiles (credits line is in the footer), the Visit Jersey clip 23719 logo decision, film hosting (the Atlantic Gateway film is 24 MB, under the 25 MiB cap). Tidy unused files (nothing in `site/` the pages do not use). Disable the old aisstream key (the stopgap `AIS_KEY` was removed from the page; the key itself should be disabled at aisstream.io by Simon or Howard).
9. **Parked:** the closing montage of the journey; the 2-second wide-plate hitch; bringing live ships and flights back (`TRAFFIC: true` plus the live feed work).
10. **Reviews design:** `CIPS-TAG/CIPS/DOCS/SPEC-reviews.md`; Simon was still thinking about the reviews approach on 30 Oct (the build-time `reviews.json` idea replaced the PHP `get-reviews.php`).

## 9. Things the old notes said that are now different

- The public site is **not** hosted on Render any more; Cloudflare Pages is the plan (Render's Hobby workspace has 5 GB outbound a month and no PHP). The Desk stays on Render.
- `site/monaco/` and `gateway/` are **not** in this repo, and nothing live needs them.
- The old "WORKING-NOW.md" lock belongs to CIPS-TAG; not used here.
- "berth-arrival", "bunkers-road" and "provisions-quay" are retired (archived in CIPS-TAG `CIPS/archive/beats`). Do not suggest rebuilding bunkers/provisions.
- The globe no longer shows "Observe the Channel Islands" or the ship list (hidden, not deleted).
- `home-port` and `statement-breather` are no longer in the run list (the finale's closing line does their job).
