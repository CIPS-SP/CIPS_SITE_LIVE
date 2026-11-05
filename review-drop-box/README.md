# CIPS review drop box

A tiny public service that holds captains' review answers in a queue until the Desk collects them, and serves the approved-reviews list the Desk publishes. **It has no Airtable key and cannot read or write Airtable.** Design: `CIPS-TAG/CIPS/DOCS/SPEC-reviews.md` (sections 4 to 6; the spec stays in CIPS-TAG, read it there).

Built 3 Nov 2026 in CIPS-TAG; copied into CIPS SITE LIVE on 5 Nov 2026, and this copy is the one to work on and deploy (the CIPS-TAG copy is left as it was). **Deployed 5 Nov 2026** on Simon@cips.agency's Cloudflare account: Worker `cips-review-drop-box` at **https://cips-review-drop-box.simon-92c.workers.dev**, KV namespace `BOX` (id in `wrangler.toml`), `ALLOWED_ORIGINS` = cipslive.pages.dev, cips.agency, www.cips.agency. The two secrets are set on the Worker and kept for Simon outside the repo (`Documents\CIPS review drop box - secrets.txt`, to move into his password manager); the Desk on Render needs the same two. Tested live 5 Nov: health, empty list, CORS only for the allowed sites, collect refused without the password, a tampered link refused, a signed test answer accepted, collected with the Desk's password (it appeared after about 30 s: KV lists lag up to a minute, so the Desk should not expect an answer the instant it is sent) and acknowledged, queue empty again. Wrangler was signed out afterwards (Simon's wish): run `npx wrangler login` again for the next deploy, and `npx wrangler logout` after. Nothing has touched Airtable except the two new fields noted in the spec.

```
src/link.js       sign and verify review links (the Desk copies this to sign; the box uses it to verify)
src/validate.js   what the box accepts from the form, and what it will publish
src/worker.js     the box itself (a Cloudflare Worker)
dev/              a local test server and an in-memory stand-in for Cloudflare's storage
tools/            make-test-link.mjs (stand-in for the Desk's link maker), fake-desk.mjs (stand-in collector)
test/run.mjs      28 checks: node test/run.mjs
wrangler.toml     Cloudflare settings (fill in the storage id)
```
This folder sits beside `site/` and is **not** part of the published website (Cloudflare Pages publishes `site/` only; the box is deployed separately with `wrangler`). The review page is `../site/review/index.html` (hidden, `noindex`, reached only through a signed link). Its one setting is `../site/review/config.js` (`window.REVIEW_API`, the box's address; on localhost it is emptied, so the page talks to its own address and local tests never reach the real queue).

## Try it locally (no accounts, no installs, Node 20 or later)
```bash
node test/run.mjs                 # the checks
node dev/dev-server.mjs           # box + page on http://localhost:8787/review/
node tools/make-test-link.mjs     # prints a signed test link: open it, fill in the form, Send
node tools/fake-desk.mjs          # collects what was sent (add --keep to look without removing)
```

## What the box does
| Call | Who | What |
|---|---|---|
| `POST /api/review` | public | Checks the link's signature and expiry, keeps only known fields (ratings 1 to 5, text capped at 2,000 characters, body capped at 16 KB), refuses a trap field, rate limits (6 per hour per address, 12 per booking), stores the answer in the queue for up to 30 days. |
| `GET /api/collect` | Desk | Up to 40 waiting answers and `more` (true if more remain). Collect again after acknowledging. |
| `POST /api/ack` | Desk | `{ids:[...]}` (up to 40): removes answers the Desk has safely written. |
| `PUT /api/reviews` | Desk | Publishes the approved list. The box cuts it to the public fields. |
| `GET /api/reviews` | public | That list, cached 5 minutes. Empty list until the Desk publishes. |
| `GET /api/health` | public | `{ok:true}` |

Desk calls carry `Authorization: Bearer <COLLECT_SECRET>`. Raw IP addresses are never stored (a hash is used for the rate limit and expires in two hours). Cross-site posts are only accepted from `ALLOWED_ORIGINS`.

## For the Desk (what to build against)
**Link** (version 1): `https://<site>/review/?p=<payload>.<signature>`, where `payload` is base64url of `{"v":1,"b":"<BOOKINGS record id, rec + 14 characters>","ship":"M/Y Name","port":"St Helier, Jersey","arr":"12 Aug 2026","dep":"14 Aug 2026","svc":["AGENCY","BUNKERS",...],"exp":"YYYY-MM-DD"}` and `signature` is base64url of HMAC-SHA256 of the payload text with `SIGNING_SECRET`. Copy `src/link.js` (`signLink`) as it is; it uses only standard WebCrypto, so it runs in the Desk's Node. Service codes are the ones the old portal used (AGENCY, AGENCY-SUB, PORT/TECH, BUNKERS, STORES, TRANSFER, HOTEL, CTM, CARGO, DELIVERIES, FERRY, LUGGAGE); the page ticks those and shows the Replenish and Suppliers questions only when the matching services are present. Strings over 80 characters are cut. Valid through the end of `exp` (UTC); the Desk's default is 60 days.

**Queue item** (from `collect`): `{id, at, booking, role, name, overall, presence, excellence, port, replenish, suppliers, fuel, appoint, didWell, couldImprove, quoteConsent, imp:{fuel,berths,airport,tidal,presence}, other}`; every field optional except `id`, `at`, `booking`.

**Into PORT CALL REVIEWS** (create-only; check for an existing row with the same Review ID first, so a lost acknowledge never writes twice): Review ID = `id`; BOOKING = [`booking`]; Overall; Presence and Relationship = `presence`; Excellence; Port & berth = `port`; Replenish and Repair = `replenish`; Suppliers; Fuel price rating = `fuel`; Appoint again; Did well; Could improve; Quote consent; Role; Reviewer name = `name` (optional text, field added 3 Nov 2026; never published); Importance — Fuel pricing, Pontoon berths, Airport proximity, Tidal access, Visible presence = `imp.fuel`, `imp.berths`, `imp.airport`, `imp.tidal`, `imp.presence`; Priorities — Other = `other`; Submitted = `at`; Status = "Pending verification" only when `overall` is present (a priorities-only answer leaves Status blank).

**Published list** (`PUT /api/reviews`): `{reviews:[{overall, appoint, didWell, ship, port, when, role}], averages:{<key>:{label, value}}, priorities:{<key>:{label, desc, stat:{avg,pct,n}}}, count}`, same shape as the old `get-reviews.php` with `role` added. Put `ship` in only when Quote consent was ticked.

## Putting it live (Simon, when ready)
0. Wrangler (Cloudflare's deploy tool) is a dev tool of this folder: `npm install` here, then run it as `npx wrangler ...` (wrangler 4; installed 5 Nov 2026 without the esbuild/workerd install scripts, which it does not need for deploying). Sign in once with `npx wrangler login`. Only the deploy needs it; the local test server and checks still need nothing installed.
1. A Cloudflare account (free plan). The box is a standalone Worker, so it works with the website wherever that ends up hosted.
2. Create a KV namespace; put its id in `wrangler.toml`; set `ALLOWED_ORIGINS` to the website's address.
3. Set two secrets (`wrangler secret put SIGNING_SECRET`, `wrangler secret put COLLECT_SECRET`), long random values, and give the same two to the Desk's settings on Render.
4. Deploy (`wrangler deploy`) and give the box an address such as `review-api.cips.agency`; put it in `site/review/config.js`.
Check Cloudflare's current free allowances first (not checked: expected to be far above a few reviews a month).

## Not built yet
Bot check beyond the trap field and rate limits (Cloudflare Turnstile is the planned extra); the Desk's half (ask, collect, approve, publish); switching the website's review sections to read `/api/reviews`; replacing the home page's "Rate…" link.
