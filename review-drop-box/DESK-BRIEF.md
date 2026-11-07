# Brief for the Desk session: the Desk's half of Port Call Reviews

Written 5 Nov 2026 by the website session (CIPS SITE LIVE), for Simon to send to the Desk session. Sent; the Desk's half is built and working (Simon, 7 Nov 2026). Kept as the record of what was asked.

## What this is
Captains review a port call through a hidden page on the website. Their answers wait in a small public "drop box" (a Cloudflare Worker) until the Desk collects them. **The website's half is built, deployed and tested live.** The Desk's half (make and email the link, collect the answers into Airtable, approve them, publish the approved list) is not started. That half is yours.

Read these first (read only, do not edit them; they belong to the website project):
- `C:\Users\amity\GitHub\Code\CIPS-SITE-LIVE\review-drop-box\README.md`: the box's calls, and the "For the Desk" section. **This is the contract.**
- `C:\Users\amity\GitHub\Code\CIPS-TAG\CIPS\DOCS\SPEC-reviews.md`: the design (sections 4A, 4E, 4F, 4G, 6, 7, 8). One change since it was written: links are now **short links** (below), not the signed `?p=` links in its section 4B.

## The drop box (live)
- Address: `https://cips-review-drop-box.simon-92c.workers.dev`
- Desk calls carry `Authorization: Bearer <COLLECT_SECRET>`. Simon will put `COLLECT_SECRET` (and `SIGNING_SECRET`, only needed for the old long links) into the Desk's Render settings himself. Never print, log or commit them.
- The review page: `https://cipslive.pages.dev/review/` for now, later `https://cips.agency/review/`. The box returns the full link itself, so the Desk never builds the address.

## What to build, in order
1. **Ask for a review** (spec 4A). The request is opt-in: a person taps **Ask for a review** on a booking that has sailed, and a "Recently departed" card offers **Ask** or **Not for this one**. Nothing is asked automatically, and commercial or regular ships are never asked.
   - The Desk calls `POST /api/links` with `{b: "<BOOKINGS record id>", ship: "M/Y Name", port: "St Helier, Jersey", arr: "12 Aug 2026", dep: "14 Aug 2026", svc: ["AGENCY","BUNKERS",...]}` (`exp` is optional; the default is 60 days). It gets back `{code, ref, exp, link}`. `link` looks like `https://cipslive.pages.dev/review/?kinship-7KQ4M2XD`.
   - The service codes are the old portal's: AGENCY, AGENCY-SUB, PORT/TECH, BUNKERS, STORES, TRANSFER, HOTEL, CTM, CARGO, DELIVERIES, FERRY, LUGGAGE. They decide which questions the page shows.
   - The link goes into a preview in the Desk's usual email window: a subject naming the ship, a short thank-you, the link, and an address the person can fix. It leaves only when a person taps Send.
   - After it is sent, set **Review Requested** (BOOKINGS, `fldSvf9Dkz3KomEAs`, a date) to today. To switch a link off early, use `DELETE /api/links/<CODE>`.
   - Make links only when someone taps Ask, never ahead of time.
2. **Collector** (spec 4E). Run it every few minutes and when the Desk starts.
   - `GET /api/collect` returns up to 40 items and `more`. For each item, check PORT CALL REVIEWS for a row with that Review ID. Create the row only if none exists (create-only); the field mapping is in the README's "Into PORT CALL REVIEWS".
   - Then `POST /api/ack` with `{ids:[...]}`. Collect again while `more` is true.
   - Status is "Pending verification" only when `overall` is present. Answers with only priorities leave Status blank and never reach the approve list.
   - A new answer can take up to a minute to show in `collect` (Cloudflare's lists lag), so don't treat a short delay as a fault.
3. **Reviews to approve** (spec 4F). The screen lists "Pending verification" rows and shows exactly what would appear on the website.
   - **Approve** sets "Verified · Published". **Hold** leaves the row as it is.
   - The captain's words are never edited. A light edit would need a "Published text" field, which does not exist yet: ask Simon first.
4. **Publish** (spec 4G). On approve, and on a timer, build the public list from Airtable in one query and send it with `PUT /api/reviews`.
   - The shape is `{reviews:[{overall, appoint, didWell, ship, port, when, role}], averages:{<key>:{label, value}}, priorities:{<key>:{label, desc, stat:{avg,pct,n}}}}`. The box trims it to these fields and recomputes `count`.
   - Include `ship` only when Quote consent was ticked. Never include a reviewer's name, contact, cost or supplier data.
   - The website does not read this list yet; switching its review sections over is the website session's job, after you publish.

## Rules
- Nothing is sent outside CIPS without a person tapping Send. Test emails go only to the Desk's test address.
- No deletes in Airtable, and no Airtable schema changes without Simon's yes. The fields this needs (Role, Review Requested, Reviewer name) already exist.
- Test with a test booking. Test rows are removed by hand in Airtable, and test links are switched off with `DELETE /api/links/<CODE>`.
- Do not edit anything in CIPS SITE LIVE or CIPS-TAG. If the box needs a change, tell Simon and the website session will make it.
- Explain choices to Simon plainly (he is not a developer), and show him each piece before moving on.

## Done looks like
A test booking gets a link from the Desk and a test email to the test address. The answer sent from the live page appears once in PORT CALL REVIEWS as "Pending verification", linked to the booking. Approving it publishes a list, `GET /api/reviews` returns it, and a second collect writes nothing twice.
