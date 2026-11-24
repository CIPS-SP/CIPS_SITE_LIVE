# CIPS website: site manual

The short reference for how www.cips.agency is put together, what it depends on, and how to change things safely. Written 17 Nov 2026, the day the site went live. Keep it true: when something here changes, change this file in the same piece of work.

The detail behind it:
- **[HANDOVER.md](HANDOVER.md):** history, and how the journey works inside.
- **[GO-LIVE.md](GO-LIVE.md):** the switch from Wix.
- **[SECURITY-PLAN.md](SECURITY-PLAN.md)**
- **[PHONE-REVIEW.md](PHONE-REVIEW.md)**
- **[review-drop-box/README.md](review-drop-box/README.md):** the drop box.

## 1. The pieces at a glance

| Piece | What it is | Where it is managed |
|---|---|---|
| **The website** | The files in `site/` of the private GitHub repo `CIPS-SP/CIPS_SITE_LIVE`. Branch `main` is what is live; `dev` is the working copy. | GitHub. Simon views `dev` on his PC with `Open CIPS Site LIVE (Windows).bat` (http://localhost:8080). |
| **Hosting** | Cloudflare Pages project **`cipslive`**. It builds `main` automatically on every push to it: output folder `site`, no build step, preview builds off. | Cloudflare dashboard > Workers & Pages > cipslive (Simon's Cloudflare account). |
| **The address** | **www.cips.agency** is the site. The plain **cips.agency** is forwarded to it (301). cipslive.pages.dev still works but is hidden from search engines. | GoDaddy (see section 2). |
| **The drop box** | A small Cloudflare Worker, **`cips-review-drop-box`** (https://cips-review-drop-box.simon-92c.workers.dev). It takes review answers, website enquiries and the journey counts. Code in `review-drop-box/`; it is never published with the site. | Cloudflare > Workers & Pages > cips-review-drop-box. Deployed from this PC with `npx wrangler deploy`. |
| **Enquiry emails** | **Brevo** (EU) sends each website enquiry from admin@cips.agency to dutyagent@cips.agency. | Brevo account (Simon). |
| **Reviews behind the scenes** | The **CIPS Desk**, a separate project on Render. It makes review links, collects the answers from the drop box into Airtable, and publishes approved reviews. | Its own project and notes. |
| **Email** | Microsoft 365 (through GoDaddy). Nothing on the website touches it. | Microsoft 365 / GoDaddy. |

## 2. The domain (GoDaddy DNS)

cips.agency is registered and its DNS is held at **GoDaddy**. Simon has delegate access to Howard's account. The nameservers stay at GoDaddy: **never move them**.

The domain lock is on, it auto-renews, and it renews on **22 July 2028**.

**Records for the website** (changed at go-live, 17 Nov 2026):

| Record | Value |
|---|---|
| `www` CNAME | `cipslive.pages.dev` (TTL 600) |
| `@` (cips.agency) | GoDaddy **Forwarding**, permanent 301, forward only, to `https://www.cips.agency`. GoDaddy manages the A record while forwarding is on. |
| `@` TXT `google-site-verification=…` | Proves to Google Search Console that we own the domain. **Keep it.** |

**Email records: never change these:**
- the MX record (Outlook)
- `selector1` and `selector2._domainkey` (Microsoft 365 email signing, 10 Nov 2026)
- the `NETORG5968282.onmicrosoft.com` TXT
- the SPF TXT `v=spf1 include:secureserver.net -all`. This looks wrong for Microsoft 365, but GoDaddy's own record includes Microsoft's servers, so it is correct.
- `_dmarc` (report-only; the weekly digest from Postmark goes to Simon)
- `autodiscover`

**Leftovers that can be tidied later** (old hosting, harmless):
- `cpanel`, `webdisk`, `webdisk.admin`, `whm` and `www.admin` CNAMEs
- the `admin` A record, pointing at Wix's old address
- `mail`: leave it unless you are sure no old device uses "mail.cips.agency"
- `msoid`: Microsoft now advises removing it

**Going back to Wix** (only while the Wix plan still exists):
- In GoDaddy, turn the forwarding off.
- Set `@` A back to `185.230.63.107`.
- Set the `www` CNAME back to `cips.agency.`

**Always share links with www** (19 Nov 2026): the bare `cips.agency` is only GoDaddy's forwarding, which sends the home address on to `https://www.cips.agency/` but not the rest of an address: `cips.agency/sectors/yachting` gives GoDaddy's "Not Found", `www.cips.agency/sectors/yachting` works. The site, the sitemap and Google only use www, so search is unaffected. A full fix needs Cloudflare to answer for the bare domain (moving the nameservers, which we do not do), unless GoDaddy's forwarding offers a "forward/preserve path" option.

## 3. The drop box and its limits

The free Cloudflare plan is enough for everything today, but two allowances are worth knowing.

**1. The drop box's storage ("BOX", Workers KV): about 1,000 writes a day, shared by everything stored there:**
- review links made by the Desk
- captains' review answers waiting to be collected
- website enquiries (saved first, then their delivery status)
- the anti-abuse counters
- the 5-minute schedule's resend bookkeeping

Guards built in (so a flood cannot use up the day's writes):
- **Enquiries:** at most 60 a day.
- **Wrong-code lookups:** recorded only up to a daily cap.

If writes ever run out, new reviews and enquiries could not be saved until the next day. The fix then is Cloudflare's paid Workers plan, about US$5 a month, which gives far more.

**2. The journey counts do NOT use BOX.** They live in their own **Durable Object** (`Counter`, a small SQLite table), with its own much larger free allowance: about 100,000 requests and row writes a day, at the time of writing. One milestone is one request.

**Secrets** are set only in the Cloudflare dashboard (Workers & Pages > cips-review-drop-box > Settings > Variables and Secrets). Their values are never written in the repo or in chat.

| Name | Type | What it does |
|---|---|---|
| `SIGNING_SECRET` | secret | Shared with the Desk |
| `COLLECT_SECRET` | secret | Shared with the Desk |
| `BREVO_API_KEY` | secret | Sending enquiry emails |
| `BREVO_WEBHOOK_TOKEN` | secret | Brevo's delivery reports |
| `STATS_KEY` | secret | The password for the journey counts page |
| `ALERT_URL` | secret | The private ntfy channel for the enquiry alert |
| `ALLOWED_ORIGINS` | setting | The site's own addresses (cipslive.pages.dev, cips.agency, www.cips.agency) |
| `REVIEW_PAGE` | setting | `https://www.cips.agency/review/` |
| `MAIL_FROM` | setting | `CIPS Website <admin@cips.agency>` |
| `ALERT_AFTER_MIN` | setting | 60 |

The ordinary settings are also in `review-drop-box/wrangler.toml`. **Keep the dashboard and that file the same**: a deploy from this PC writes the file's values over the dashboard's.

**Junk enquiries (18 Nov 2026):** robots are thanked and their posts dropped (nothing saved or emailed) if they fill the hidden trap field, take under 4 seconds, or post without the page (no form timing). A junk one that still gets through (made-up names, lorem-ipsum text): do not reply, just delete it. If they become regular, the next step is a bot check (Cloudflare Turnstile).

**Enquiry alert (17 Nov 2026):** `ALERT_URL` (secret) is a private **ntfy** channel (`https://ntfy.sh/<topic>`; the topic name is in Simon's ntfy app, never in the repo). If an enquiry is not confirmed delivered within an hour, or Brevo refuses the key, the drop box sends an urgent push notification to the ntfy app on Simon's phone. It carries only the enquiry reference, topic and time; the names and contact details stay in the drop box. Anyone else who should get the alert installs the free ntfy app and subscribes to the same topic (server ntfy.sh). A test can be sent with any web request to the topic's address. To change it, set a new `ALERT_URL` secret.

**Brevo's free plan** sends up to 300 emails a day. It is used only for enquiries.

## 4. Seeing how the site is doing

| What | Where |
|---|---|
| **Visits:** how many people, which pages, where they came from, country, device | **Cloudflare Web Analytics** (Cloudflare menu > Web Analytics). Cookie-free. Switched on in the Pages project on 17 Nov 2026 and live since the release that day. |
| **Search:** how often you appear in Google, for which searches, clicks | **Google Search Console** (search.google.com/search-console, under the Google account Simon used on 17 Nov 2026), domain property **cips.agency**, verified by the TXT record above. Sitemap submitted: `https://www.cips.agency/sitemap.xml`. |
| **The journey:** how many started, reached the sea, harbour and quay, saw the film, skipped to CIPS, went on to the main site, sent an enquiry; and the problems (visits where the globe could not start) | **Journey counts:** https://cips-review-drop-box.simon-92c.workers.dev/stats (the browser asks for a password: any user name, the `STATS_KEY` secret as the password). Each milestone counts once per visit; totals per day, Jersey time; shows today, 7, 30, 90 and 365 days and all time (nothing is ever deleted). |
| **Business listing** | Google Business Profile (business.google.com/locations shows the ones you manage). Two listings were found on 17 Nov 2026: A, "Channel Island Port Services" (07797 720723, 1 review, links to the site), and B, "... - CIPS (St Helier Port Services Ltd)" (01534 870300, 22 reviews, no website). The plan: claim or get access to B, bring it up to date (name, www.cips.agency, the 24/7 number, open 24 hours, the address exactly as on the site), then merge A into it or report A as a duplicate. |

### Monthly check (about 20 minutes)

Do this once a month. To have it read through, export or screenshot what you see and share it in a Claude session: it can explain what the figures mean and suggest what to change.

**1. Google Search Console** (search.google.com/search-console, property cips.agency; set the date range to the last 28 days, or compare with the previous period):
- **Performance:**
  - The four numbers: impressions (how often the site appeared in Google), clicks, CTR (clicks as a share of impressions) and average position (1 is the top).
  - Then the **Queries** tab (the searches people typed before seeing the site) and the **Pages** tab.
  - To share it: Export (top right) > Download CSV.
- **Indexing > Pages:**
  - Indexed should be the home page and the three legal pages.
  - Expected under "Not indexed", and fine: the switched-off desk pages ("Excluded by noindex tag"), the old Wix addresses ("Page with redirect"), and /review/ ("Blocked by robots.txt").
  - Anything else listed there is worth a look.
- **Sitemaps:** the status should be **Success**, with 4 pages.
- **Experience** (Core Web Vitals, HTTPS): green is good. It needs a few weeks of visitors first.
- Google also emails real problems to the account.

**2. Cloudflare Web Analytics** (Cloudflare menu > Web Analytics > www.cips.agency):
- visits and page views over the month
- the top pages
- where visitors came from ("referrers": Google, LinkedIn, WhatsApp, typed in)
- countries, and phone or computer

**3. Journey counts** (https://cips-review-drop-box.simon-92c.workers.dev/stats, any user name, the `STATS_KEY` password). Look at the "Last 30 days" column:
- How many started the journey, as a share of those who saw the globe.
- How far they got: sea, coast, harbour, quay, film.
- How many skipped to CIPS, and where: at the globe, or during the journey.
- How many sent an enquiry.
- **Leaderboard entries** (since 24 Nov 2026): the latest 60 scores players put on the mini-games' leaderboard (three initials, a vessel type, the score). **Hide** takes one off the public board (Show again puts it back). Look for rude initials or impossible-looking scores.
- **Problems** (at the foot of the page, since 23 Nov 2026): visits where the 3D globe could not start, with the browser and system and the error. The site then took those visitors straight to the main site with a note to switch on graphics acceleration. A few are normal (old computers, work laptops). Many from one browser, or a new error after a release, need looking at: share a screenshot in a session.

A sharp drop between two milestones shows where people lose interest.

**4. The drop box's health** (Cloudflare > Workers & Pages > **cips-review-drop-box**):
- **Metrics:** requests and errors over the month. A few errors are normal (made-up review codes, refused requests from other websites). A steady stream is worth a look.
- **Logs** (Observability): the drop box's own log of recent requests and anything that went wrong. Filter by "error" to see only problems.
- **Settings > Triggers:** the 5-minute schedule should be listed (it resends enquiries that failed and raises the ntfy alert).
- **Allowances:**
  - Cloudflare > Storage & databases > KV > **BOX**: the daily writes, against the ~1,000 a day free allowance. Reviews, links and enquiries use them, and should be far below.
  - Durable Objects > **Counter**: the journey counts' requests, against the ~100,000 a day allowance.
  - Workers & Pages > Overview: the account's daily Worker requests (also ~100,000 a day).
- **Enquiries:** each one should have arrived at dutyagent@. If an ntfy alert ever came in, check that enquiry was answered.

**5. Google Business Profile** (business.google.com):
- new reviews: reply to them
- the profile's own figures: searches, calls, direction requests
- that the details still match the website

## 5. Privacy promises the code must keep

The **Cookies** and **Privacy** pages (`site/legal/`) describe exactly what the site does. If the code changes, they change with it:
- no cookies, no advertising, no tracking
- Cloudflare Web Analytics (cookie-free totals)
- the journey counts (totals per day, nothing about the visitor)
- a short list of browser-storage keys: `cips.vessel`, `cips.counted`, `cips.perfLevel`, and the arrival game's settings

The site may load nothing from outside servers **except**:
- the drop box (`site/review/config.js`)
- Cloudflare Web Analytics

The security headers (`site/_headers`, written by `tools/csp.mjs`) allow exactly these and nothing else. Run `node tools/csp.mjs` after changing any script that is written inside a page.

## 6. Common changes

**The picture shown when the site is shared:** replace `site/images/brand/og-share.jpg` (1200 × 630) under the same name and release. LinkedIn's Post Inspector refreshes a preview it has cached.

**Switching a desk page on or off** (Yachting, Cruise, Offshore, Shipping; all four switched on 19 Nov 2026). To switch one off again, reverse these steps:
1. Finish the page.
2. Remove its `<meta name="robots" content="noindex">`.
3. Add it to `site/sitemap.xml`, without ".html".
4. Turn its home page card back into a link: `data-off-href` becomes `href` in `index.html`.

**The business details Google and AI assistants read:** the `application/ld+json` block near the top of `site/index.html`. Name, legal name, address (New North Quay, St Helier Marina, St Helier, Jersey JE2 3ND, Simon 17 Nov 2026), phone, email, area, opening hours, services, LinkedIn.

**Reviews and testimonials** (18 Nov 2026): all in Airtable PORT CALL REVIEWS, by **Type**:
- **CIPS Form:** set by the Desk on every review from the CIPS review form. Only these count in the Port Call Index score and panel.
- **Testimonial** (a comment a client gave CIPS, used with their OK) and **Imported** (a review published elsewhere, such as Yachting Pages or SSG), typed in by hand: Published text, Type, From (Manual), and for Imported, Source (Manual) and Source link (Manual).
- Set Status to **Verified · Published** to show it. Testimonial and Imported rows appear in the "What our clients say" strip under the Port Call Index, gliding sideways, with arrows.
- A row with no Type is not shown.
- The Desk sends the list to the drop box, which passes on only known fields (`review-drop-box/src/validate.js`). The website reads it.

**Photos in a desk page's gallery** (the top panel: a large photo, moving on by itself, with thumbnails under it; 19 Nov 2026): chosen with the image picker. The first pick opens the gallery.
1. Put new photos in the CIPS Image Library in Dropbox (any subfolder; HEIC is fine).
2. Double-click **Open Image Picker (Windows).bat** in this folder (or ask Claude to open it). It shows every photo in the library; "Newest added first" brings new ones to the top.
3. Choose the desk at the top ("Picking for"), click a photo and press P (or the star) to add or remove it. In "Show picks only", drag or use the arrows to set the order. Everything saves as you go, in `tools/picker-picks.json`.
4. Ask Claude to "update the yachting carousel from the picker", or run `python tools/build-carousel.py yachting` (or cruise, offshore, shipping) yourself. The script makes the copies, removes ones no longer picked and rewrites the photo list on the desk page; each photo's description (what search engines and screen readers read) and any crop focus are in `tools/carousel-notes.json`, and the script lists any photo that still needs one. Then check the page and push. The website never reads Dropbox itself (it must not ask any other server for anything), so each picked photo is copied into `site/images/carousel/`, cropped to the carousel's shape and made small enough for the web. **The copies are renamed by desk and place in the order (Simon, 19 Nov 2026): `YACHTING_1.jpg`, `YACHTING_2.jpg` … (`CRUISE_1.jpg`, `OFFSHORE_1.jpg`, `SHIPPING_1.jpg`), so no original file name (camera numbers, yacht or client names) ever goes into the website or its repository.** The picks file keeps the link back to each original. Then release as usual.

A photo edited for the website (such as the bow on the pontoon with the sky made blue, `IMG_2429 blue sky.jpg`) goes back into the library as its own file and is picked like any other.

The picker code is `tools/image-picker.py` (it needs Python with Pillow and pillow-heif, already on this PC). It runs on this PC only, at http://localhost:8095, and only reads the library.

**Something to count on the journey:** add the word in `review-drop-box/src/counts.js` (`EVENTS`) and in `site/js/journey-counts.js`, deploy the drop box, then release the site.

**Old addresses that should redirect:** `site/_redirects`. The old Wix pages all go to the home page. Short desk addresses (21 Nov 2026): www.cips.agency/shipping, /yachting, /offshore and /cruise go to the desk pages, while /gallery and /blog (left over from the Wix site) show the Not found page on purpose, so Google drops them (Simon: they should not exist). Redirects only work on the live site, not on localhost.

## 7. Releasing a change

1. Work on `dev` and check it locally (http://localhost:8080).
2. Run the checks: `cd tools`, then `node csp.mjs` if a script inside a page changed, then `node check.mjs` (about 20 minutes, or `--pages` for a quick one).
3. Only when Simon says "push": push `dev`, then push `dev` to `main`. Cloudflare publishes `main` within a minute or two.
4. **To undo a bad release quickly:** Cloudflare > cipslive > Deployments > pick the previous good one > Rollback.

The drop box is separate. It changes only with `npx wrangler deploy` from `review-drop-box/`, after `npx wrangler login` as the CIPS Cloudflare account (Simon clicks Allow in the browser). This PC is kept signed out between changes (`npx wrangler logout`, 17 Nov 2026), so nothing on it can reach the Cloudflare account.

## 8. Dates to remember

| When | What |
|---|---|
| About 24 Nov 2026 | Raise "always use https" (HSTS) in `site/_headers` from one day (86400) to a year (31536000). |
| A few days after 17 Nov 2026 | Remove cips.agency from the Wix site. |
| About 1 Dec 2026 | Cancel the Wix plan. Save anything wanted first; nothing from the gallery is needed. |
| Before 7 Nov 2027 | Renew `site/.well-known/security.txt` (its `Expires:` date). |
| 22 July 2028 | Domain renewal (auto-renew is on). |

## 9. Not blocking, still on the list

- **To do (Simon, 19 Nov 2026):** in GoDaddy, the cips.agency forwarding: look for a "forward path" or "preserve path" option and switch it on, so addresses like `cips.agency/sectors/yachting` reach the page (today only the bare home address forwards). A screenshot of the settings screen is enough for Claude to say which option.
- **Come back to:** Desk LIVE's "Find out more" button on the desk pages, taken off until `desk-live.html` (still a wireframe) is finished.
- Airtable's data processing agreement, with Jersey's addendum.
- A Jersey adviser's read of the legal pages.
- A look on a tablet and an Android phone.
- Email security on sthelierportservices.com and sthps.com.
- A one-page "if something goes wrong" note.
- Disabling the old aisstream key.
