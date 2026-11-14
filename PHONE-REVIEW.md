# Phone review (HANDOVER.md open job 17)

Started 13 Nov 2026. Checked locally, emulating phones: 375x812 and 360x740 upright, 844x390 and 740x360 sideways, touch and an iPhone user agent (browser pane plus headless Chrome scrolling the whole journey). **Not yet checked on a real phone:** how scrolling feels, iOS Safari, speed on mobile data, battery and heat.

Every page, the journey's opening, the home sections, the legal pages, the 404 page and the captain's review form (through the local drop box) were checked. Each page was also checked automatically for anything running off the side of the screen (only finding 5 does), text under 11 px and small tap targets.

## Findings, most important first

1. **On a real phone the journey after the clouds is a still photo.** `seaway-wake`, `noirmont-transit` and `st-helier-approach` switch to a "static fallback" on any touch screen whose short side is 480 px or less (`smallPhone` / `mobile` near the top of each `beat.js`: `coarse && Math.min(innerWidth, innerHeight) <= 480`). Phone visitors therefore see one still yacht on a teal sea from the open sea right through Noirmont, the pilot, the harbour, the berthing, the quay at work and the finale. No plotter, no video windows, no game doors, no services panel. This came over from the lab at seeding. The PC's "Phone view" button cannot imitate a touch screen, so it always showed the full scenes, which is why it was never noticed. Run on a phone-sized screen without the touch switch, the full scenes do render and mostly fit. They use the existing lighter setting (`RES` 192 on narrow screens).
   **Decided 13 Nov (Simon), built the same day to his storyboard: a lighter version of the scrolled journey.** (A first try the same day, the clips one after another with captions, was not liked and is gone.) At sea (`seaway-wake`, `noirmont-transit`, on their static fallback) a light, flat scene, `_beats/_shared/phone-sea.js` and `.css` with the `phone:` plan in each `beat.js`: the yacht's plan sprite sails DOWN the page on the harbour scene's own sea (14 Nov, Simon: "the harbour tile appearance is what I want everywhere": a seamless patch cut from a frame of the 3D harbour approach, `_shared/phone-sea.jpg`) with the main site's own wake (cut from a frame of the 3D harbour approach, `_shared/phone-wake.png`), a little smaller so the chart plotter fits bottom left (fed from GEO.route at sea, the real Noirmont route after), "Some places you pull in", the pilot launch comes alongside and the pilot steps across, "Pilot aboard, under way", the Corbière clip slides in over it, "Round Noirmont Point", then the Small Roads clip while she turns to port through east onto 022, the Small Road lead, where the harbour scene takes over (14 Nov, Simon: no flip; turn as Special One rounds the breakwater). The clips open small at the bottom right, beside the plotter (bottom left) at the same size; Enlarge spreads a clip across the screen over the plotter (14 Nov, Simon; `phone-sea.css`, end). Then `st-helier-approach` runs its REAL scene on phones (`phoneGL` from `index.html`), lighter: no game doors, the services list as a five-column strip at the top, the plotter bottom left and the footage bottom right as at sea, the leading-lights panel top right (`html.cips-phone-gl`, end of its `beat.css`), and shorter (3200vh: chapters 1-3 400vh, the quay 2200vh, the finale 600vh, which still plays by itself). Tracks on phones (`PHONE_JOURNEY` in `index.html`): 700vh, 500vh, 3200vh, about 44 screens after the clouds. Unitedcarriers.com on a phone (looked at 13 Nov): a short animated opener, then big type and full-width pictures; nothing to copy for the journey itself. **Still to do:** Simon tries it on a real phone (smoothness, heat, the 3D harbour on older phones; if the harbour cannot run the old still is the fallback); the departure film is cropped to the middle of the frame upright; the quay runs about six times faster than on a computer.
2. **Fixed 14 Nov (`_beats/globe-live/beat.css`, end; scenes version bumped in `beats.json`): on a phone the intro line has a dark shadow, the Swipe hint is not shown, and once the picker opens or the journey starts the intro text, the four cards and the hint fade away; sideways, no cards and the headline below the header.** Was: the opening globe on a phone.
   - The intro paragraph sits over the globe's dots and is hard to read.
   - The "Swipe to rotate · scroll to move on" hint overlaps the bottom-right card.
   - After "Scroll to start the journey", the voyage card and "Scroll to continue" sit on top of the intro text, and the map labels (CHANNEL ISLANDS) run through it.
   - Sideways: the headline is hidden under the header, and the four cards cover the two buttons.
3. **If the full scenes go on phones (1a), the scene panels need a phone layout:**
   - The video window and the chart plotter stack in the bottom-left and cover a third of the screen.
   - The alongside services panel covers the yacht at the quay.
   - "Take the helm: the berthing" overlaps the plotter.
4. **Fixed 14 Nov: review stars now about 40 px each, under each question on a phone (`review/index.html`).** Was: the stars are about 20 px wide (`review/`, `.stars .s`), fiddly to tap. A captain is likely to answer on a phone. Make them larger and put them under each question on phones.
5. **Fixed 14 Nov: on a phone the label sits above the value (`home/qr-home.css`).** Was: the email address runs off the screen at 360 px wide (home and yachting page, "Email dutyagent@cips.agency" beside its label). Put the label above the value on phones.
6. **Fixed 14 Nov: on a phone the pill says only "Play the CIPS journey", on one line (`index.html`, `.btg-lead`).** Was: the "Back to the globe · Play the CIPS journey" pill wraps to three lines on a phone.
7. **Smaller points** (14 Nov: the four figures now two by two on a phone, and the legal tabs 37 px tall to tap; the rest left as they are):
   - The four figures (24/7, VAT & duty free, …) and the nine services are one per row: a long scroll on a phone.
   - Many 11 px labels.
   - The legal pages' tab links and the inline phone and email links are short to tap (17 to 21 px tall).
   - The cruise, offshore, shipping and Desk LIVE pages are still wireframes with the old header (top bar). They are reachable from the yachting page's "Other desks" and the footer's "Desk LIVE".

## Fine on a phone
- The header and its menu: call button, WhatsApp, menu.
- The home sections from About to the footer.
- The yachting page, apart from finding 5.
- The legal pages, the 404 page and the enquiry form.
- The review form, apart from the stars.
- The Atlantic Gateway film already sends phones the 720p file (15 MB) instead of the 24 MB one.

## Still to check
- On a real phone (Simon's): touch scrolling through the journey, iOS and Android.
- The games' phone controls, once finding 1 is decided.
- Tablets.
- Loading on mobile data. The journey's clips are 2 to 4 MB each, and the departure film is 18 MB.
