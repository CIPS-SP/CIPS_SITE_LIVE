# Security review: plan (started 7 Nov 2026)

HANDOVER.md open job 13. Scope: the public website (`site/`, Cloudflare Pages), the drop box (`review-drop-box/`, Cloudflare Worker) and the accounts and email set-up around them. Not in scope: the Desk (its own project on Render) and Howard's lab.

What we already have going for us: the site is static and loads nothing from other servers; no cookies or tracking; the only things that take input are the review page and the enquiry form, both through the drop box, which checks and caps every field, rate-limits, refuses other websites and keeps its secrets out of git.

## What was found while planning (7 Nov)
- Live response headers (cipslive.pages.dev): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Robots-Tag: noindex`. **Missing:** a Content-Security-Policy, protection against the site being shown inside someone else's page (clickjacking), a Permissions-Policy, and HSTS (not needed on pages.dev, which browsers already force to HTTPS; needed on cips.agency).
- Git history: no Brevo key, no drop box secrets found (only the placeholder test values). `.gitignore` covers `node_modules`.
- The reviews list on the home page escapes the review text before showing it; the enquiry thank-you escapes the visitor's name and contact.
- `desk-live-login.html` is a preview log-in page with an email and password box that sends nothing.
- cips.agency email: Microsoft 365 through GoDaddy, SPF `include:secureserver.net -all`, **no DMARC record**.

## The plan

### A. The website (Claude, on `dev`, checked locally before any release)
1. **Security headers** in `site/_headers`: frame protection (`frame-ancestors 'none'` / `X-Frame-Options: DENY`), `Permissions-Policy` (no camera, microphone, location, payment), and a **Content-Security-Policy** that allows only our own files and the drop box. The CSP needs care: the pages use inline scripts and the globe uses WebGL, so it is built and tested page by page with the full check (`node check.mjs`) before it goes live. HSTS added when cips.agency is connected.
2. **Anything that puts text into a page** (`innerHTML`): list every place, confirm what reaches it is escaped or our own.
3. **What is public**: confirm nothing in `site/` that should not be (notes, old files, internal addresses, personal data); links that open a new tab carry `rel="noopener"`.
4. **The preview log-in page**: a page asking for a password that goes nowhere can teach people to type real passwords into it. Decide: hide the header's "Log in" link until log-in is real, or keep it with the clear "preview" line.

### B. The drop box (Claude, tests first; redeploying needs Simon's OK)
5. **Read-through of `src/worker.js` and `src/enquiry.js`** for anything that can be abused: sizes, field checks, CORS, password and token checks, error messages that say too much.
6. **Flood resistance.** Cloudflare's free plan allows about 1,000 KV writes a day; a determined flood of fake reviews or enquiries could use them up and stop real ones for the rest of the day. Measure how many writes each request costs, and consider a Cloudflare rate-limiting rule on `/api/*` (one is free) in front of the box.
7. **Secrets**: where each one lives (Cloudflare, Render, Brevo), who can see them, how to replace one quickly; Wrangler signed out after every deploy.
8. **Bot check**: Cloudflare Turnstile would stop more robots but loads a script from Cloudflare, which breaks the site's "nothing from outside" rule. Decide whether to keep relying on the trap field, timing and rate limits.
9. **Tools**: `npm audit` on the drop box's one tool (Wrangler, used only to deploy).

### C. Accounts and email (Simon, with a checklist from Claude): the biggest real-world risks
10. **Two-step sign-in (2FA)** on every account that can change the site or read its data: GitHub, Cloudflare, GoDaddy, Brevo, Airtable, Render, Microsoft 365. Check who has access to each and remove anyone who no longer needs it.
11. **GoDaddy domain lock** (transfer lock) on cips.agency, and a check of who can edit its DNS.
12. **Stopping fake CIPS emails.** Without DMARC, anyone can send email that claims to be from cips.agency; for a port agency the danger is fake invoices or bank details sent to clients. Brevo's set-up adds a DMARC record in report-only mode; after a few weeks of reports, tighten it to quarantine. Check at the same time that the SPF record covers Microsoft 365's outgoing mail.

### D. When cips.agency goes public
13. HSTS, the custom domain on the Pages project, removing `noindex` for cips.agency only, the drop box's allowed addresses and `REVIEW_PAGE`.

### E. If something goes wrong
14. A one-page "what to do" note: a leaked key (replace it in Cloudflare and Brevo), the site changed by someone else (roll back on Cloudflare Pages), a personal-data breach (Jersey law: tell the JOIC within 72 hours if it is a risk to people; keep a record either way).

## Order
A1 to A4 and B5 to B9 can be done now on this PC. C10 to C12 are Simon's, in his own time (C12 goes with the Brevo DNS work). D at go-live. E alongside. Findings go in this file with a plain severity (fix now / fix soon / note), then fixes on `dev`, checked, committed, and released only on Simon's say-so.
