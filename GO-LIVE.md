# Go-live: moving cips.agency from Wix to the new site

Prepared 17 Nov 2026. These steps move **www.cips.agency** from the old Wix site to the new site (Cloudflare Pages project `cipslive`, which builds `main`). They also send **cips.agency** on to www. Email (Microsoft 365) is not touched at any point.

## Before the day: where things stand (Simon, 17 Nov 2026)

**Done or settled:**
- The self-playing finale is fine on a computer.
- The iPhone crash after a fast scroll is fixed.
- Nothing from the Wix gallery needs keeping.
- Image and footage permissions are fine, the Visit Jersey logo included.

**Still to check:** a tablet, an Android phone, slow mobile data. (A phone held sideways now gets 'Turn your phone upright' over the journey, with Skip to CIPS; 17 Nov 2026.)

**Still to choose:** how to be alerted if an enquiry has not reached dutyagent@ within an hour (`ALERT_URL`, HANDOVER item 16).

**Kept on the list, not blocking go-live (Simon):**
- Airtable's data processing agreement and the Jersey addendum.
- A Jersey adviser's read of the legal pages.

**Google Business Profile (checked on Google Maps, 17 Nov 2026):** there are two listings.
- "Channel Island Port Services": Shipping service, New North Quay, open 24 hours, 07797 720723, 5.0 from 1 review. It already links to https://www.cips.agency/, so nothing to change at go-live.
- "Channel Island Port Services - CIPS (St Helier Port Services Ltd)": Port, New North Quay, 01534 870300, 4.2 from 22 reviews, no website link. Simon to check which one he manages, and whether the second should be claimed and merged, or given the website.

## How things are today (checked 17 Nov 2026)

- **DNS is at GoDaddy** (nameservers ns19/ns20.domaincontrol.com), and it stays there. The nameservers do not move.
- **cips.agency** has an A record pointing to `185.230.63.107` (Wix). Wix sends it on to https://www.cips.agency/.
- **www.cips.agency** is a CNAME to `cips.agency`, so it is served by Wix too. Write these two values down: they are the way back.
- **The Wix site has five pages:** the home page, `/cookie-policy`, `/gallery`, `/privacy` and `/terms-of-use`.
- **Email records are not changed by any step here:** MX, autodiscover, SPF, DMARC, the Microsoft 365 DKIM CNAMEs and the `NETORG…` TXT.

**Why www and not the bare cips.agency.** A Cloudflare Pages site can only sit on a bare domain if the whole domain's DNS moves to Cloudflare, and we are not moving the nameservers. So the site lives at www.cips.agency, which is what Wix used too, and GoDaddy forwards cips.agency to it.

## Already prepared in the site (on `dev`, released with the next push)

None of these do anything until www.cips.agency points at the new site.

- **`site/_redirects`:** the old Wix pages (`/privacy`, `/cookie-policy`, `/terms-of-use`, `/gallery`) all go to the new home page (Simon, 17 Nov 2026); since 21 Nov 2026 `/gallery` shows Not found instead (Simon: it should not exist), so old links and search results keep working.
- **`site/_headers`:** "always use https" (HSTS) for www.cips.agency only, starting at one day. The cipslive.pages.dev address keeps its "do not index" rule. cips.agency is not matched by that rule, so it is indexable from the moment it is live.
- **`site/sitemap.xml`** and a `Sitemap:` line in `robots.txt`, both for www.cips.agency.
- **The review drop box** already accepts requests from cips.agency and www.cips.agency (`ALLOWED_ORIGINS`).

## The day before

1. **Lower the TTL (Simon, GoDaddy > cips.agency > DNS).** Set the TTL of the `@` A record and the `www` CNAME to the lowest offered (600 seconds or 1/2 hour). The switch, and any switch back, then takes effect in minutes rather than hours. Change nothing else.
2. **Check the new site is current (Claude).** `main` is the version wanted, the full check has passed, and cipslive.pages.dev looks right on a phone and a computer.

## On the day (about an hour; best at a quiet time)

3. **Add the domain in Cloudflare first (Simon).** Go to Cloudflare dashboard > Workers & Pages > `cipslive` > Custom domains > Set up a custom domain, and enter `www.cips.agency`. Cloudflare then says which CNAME to create: `www` to `cipslive.pages.dev`. Do this step before the DNS change. A CNAME pointing at Pages for a domain the project does not know gives visitors an error page (522).
4. **Point www at Cloudflare (Simon, GoDaddy DNS).** Edit the existing `www` CNAME: change its value from `@` to `cipslive.pages.dev`. From this moment www.cips.agency stops showing Wix.
5. **Wait for "Active" (Simon, in Cloudflare).** In Custom domains, wait for www.cips.agency to show Active, with its certificate issued. This usually takes minutes and can take up to a few hours. Until then some visitors may get a certificate warning, which is why a quiet time is best.
6. **Forward the bare domain (Simon, GoDaddy > Domain > Forwarding).**
   - Forward `cips.agency` to `https://www.cips.agency` as a permanent (301) redirect, "forward only" (no masking).
   - GoDaddy now serves forwarding over https. This replaces the `@` A record (Wix) with GoDaddy's forwarding address and locks it while forwarding is on.
   - Afterwards, check that GoDaddy has not changed the `www` CNAME back to `@`, and put it back to `cipslive.pages.dev` if it has.
   - Do not touch MX, TXT or the other CNAMEs.
7. **Switch the review links over (Claude, with Simon's go-ahead).**
   - In `review-drop-box/wrangler.toml`, set `REVIEW_PAGE = "https://www.cips.agency/review/"` and deploy the drop box (`npx wrangler deploy`).
   - In `site/.well-known/security.txt`, change `Policy:` to `https://www.cips.agency/legal/privacy.html#report` and add `Canonical: https://www.cips.agency/.well-known/security.txt`. Then commit, push and release.
   - Check whether the CIPS Desk (Render) keeps its own copy of the review page address, and change it there too if so.

## Checks straight after (Claude, then Simon on his phone)

8. **Addresses and redirects.**
   - https://www.cips.agency shows the new site.
   - http://www.cips.agency goes to https.
   - https://cips.agency and http://cips.agency both go to https://www.cips.agency.
   - The old addresses /privacy, /cookie-policy, /terms-of-use and /gallery go to the new home page.
9. **The site itself.**
   - The journey runs on a phone and a computer, start to finish.
   - A test enquiry from the home page arrives at dutyagent@ with its reference.
   - A review link opens on the new address.
   - The browser shows the padlock on every page.
10. **Email still works.** Send to dutyagent@cips.agency from outside, and send out from it.
11. **Search engines.**
    - The response headers on www.cips.agency show no `noindex`.
    - Add www.cips.agency in Google Search Console (verified by a TXT record at GoDaddy; a new TXT record does not affect email) and submit `https://www.cips.agency/sitemap.xml`. Same in Bing Webmaster Tools.
    - Google Business Profile: the listing with 07797 720723 already links to https://www.cips.agency/ (see above).

## Afterwards

12. **Wix (Simon).** Once the new site has been fine for a few days, remove the domain from the Wix site (Wix dashboard > Domains). Keep the Wix plan for about two weeks as a fallback, then cancel it.
13. **HSTS (Claude, about a week later).** Once nothing has gone wrong, raise `max-age` in `site/_headers` from 86400 (one day) to 31536000 (one year).
14. **Optional, later.** Move the review drop box to its own address (review-api.cips.agency). Also SEO item 11 in `HANDOVER.md`: titles, descriptions, structured data.

## If it goes wrong: switching back to Wix (minutes, with the lowered TTL)

- In GoDaddy, turn forwarding off for cips.agency and put the `@` A record back to `185.230.63.107`.
- Set the `www` CNAME back to `@`.
- Wix serves the old site again. Nothing on the new site needs undoing: it stays on cipslive.pages.dev.
