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

**Enquiry alert (17 Nov 2026):** `ALERT_URL` (secret) is a private **ntfy** channel (`https://ntfy.sh/<topic>`; the topic name is in Simon's ntfy app, never in the repo). If an enquiry is not confirmed delivered within an hour, or Brevo refuses the key, the drop box sends an urgent push notification to the ntfy app on Simon's phone. It carries only the enquiry reference, topic and time; the names and contact details stay in the drop box. Anyone else who should get the alert subscribes to the same topic in the ntfy app. To change it, set a new `ALERT_URL` secret.

**Brevo's free plan** sends up to 300 emails a day. It is used only for enquiries.

## 4. Seeing how the site is doing

| What | Where |
|---|---|
| **Visits:** how many people, which pages, where they came from, country, device | **Cloudflare Web Analytics** (Cloudflare menu > Web Analytics). Cookie-free. Switched on in the Pages project on 17 Nov 2026; Cloudflare adds its script when the site is next published. |
| **Search:** how often you appear in Google, for which searches, clicks | **Google Search Console**, domain property **cips.agency**, verified by the TXT record above. Sitemap submitted: `https://www.cips.agency/sitemap.xml`. |
| **The journey:** how many started, reached the sea, harbour and quay, saw the film, skipped to CIPS, went on to the main site, sent an enquiry | **Journey counts:** https://cips-review-drop-box.simon-92c.workers.dev/stats (the browser asks for a password: any user name, the `STATS_KEY` secret as the password). Each milestone counts once per visit; totals per day, Jersey time; shows today, 7, 30, 90 and 365 days and all time (nothing is ever deleted). |
| **Business listing** | Google Business Profile: there are two listings. The 07797 720723 one links to www.cips.agency. The 01534 870300 one (22 reviews) has no website link: Simon to check which he manages. |

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

**Switching on a desk page** (Yachting, Cruise, Offshore, Shipping; all switched off now):
1. Finish the page.
2. Remove its `<meta name="robots" content="noindex">`.
3. Add it to `site/sitemap.xml`, without ".html".
4. Turn its home page card back into a link: `data-off-href` becomes `href` in `index.html`.

**The business details Google and AI assistants read:** the `application/ld+json` block near the top of `site/index.html`. Name, legal name, phone, email, area, opening hours, services, LinkedIn.

**Something to count on the journey:** add the word in `review-drop-box/src/counts.js` (`EVENTS`) and in `site/js/journey-counts.js`, deploy the drop box, then release the site.

**Old addresses that should redirect:** `site/_redirects`. The old Wix pages all go to the home page.

## 7. Releasing a change

1. Work on `dev` and check it locally (http://localhost:8080).
2. Run the checks: `cd tools`, then `node csp.mjs` if a script inside a page changed, then `node check.mjs` (about 20 minutes, or `--pages` for a quick one).
3. Only when Simon says "push": push `dev`, then push `dev` to `main`. Cloudflare publishes `main` within a minute or two.
4. **To undo a bad release quickly:** Cloudflare > cipslive > Deployments > pick the previous good one > Rollback.

The drop box is separate. It changes only with `npx wrangler deploy` from `review-drop-box/`, after `npx wrangler login` as the CIPS Cloudflare account.

## 8. Dates to remember

| When | What |
|---|---|
| About 24 Nov 2026 | Raise "always use https" (HSTS) in `site/_headers` from one day (86400) to a year (31536000). |
| A few days after 17 Nov 2026 | Remove cips.agency from the Wix site. |
| About 1 Dec 2026 | Cancel the Wix plan. Save anything wanted first; nothing from the gallery is needed. |
| Before 7 Nov 2027 | Renew `site/.well-known/security.txt` (its `Expires:` date). |
| 22 July 2028 | Domain renewal (auto-renew is on). |

## 9. Not blocking, still on the list

- Airtable's data processing agreement, with Jersey's addendum.
- A Jersey adviser's read of the legal pages.
- A look on a tablet and an Android phone.
- Email security on sthelierportservices.com and sthps.com.
- A one-page "if something goes wrong" note.
- Disabling the old aisstream key.
