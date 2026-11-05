// Where the review form sends answers: the address of the CIPS review drop box (no trailing slash).
// 5 Nov 2026: the drop box is live on Cloudflare (Worker "cips-review-drop-box", code in review-drop-box/ beside site/). It accepts answers only from the
// addresses in its ALLOWED_ORIGINS (cipslive.pages.dev, cips.agency, www.cips.agency). Later it can move to review-api.cips.agency: change it here.
window.REVIEW_API = 'https://cips-review-drop-box.simon-92c.workers.dev';
// On this PC (localhost) the page talks to the same address it came from, as before: the local test server (review-drop-box/dev) answers there,
// and nothing a local test sends can reach the real queue.
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) window.REVIEW_API = '';
