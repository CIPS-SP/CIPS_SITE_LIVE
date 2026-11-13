# Phone review (HANDOVER.md open job 17)

Started 13 Nov 2026. Checked locally, emulating phones: 375x812 and 360x740 upright, 844x390 and 740x360 sideways, touch and an iPhone user agent (browser pane plus headless Chrome scrolling the whole journey). **Not yet checked on a real phone:** how scrolling feels, iOS Safari, speed on mobile data, battery and heat.

Every page, the journey's opening, the home sections, the legal pages, the 404 page and the captain's review form (through the local drop box) were checked. Each page was also checked automatically for anything running off the side of the screen (only finding 5 does), text under 11 px and small tap targets.

## Findings, most important first

1. **On a real phone the journey after the clouds is a still photo.** `seaway-wake`, `noirmont-transit` and `st-helier-approach` switch to a "static fallback" on any touch screen whose short side is 480 px or less (`smallPhone` / `mobile` near the top of each `beat.js`: `coarse && Math.min(innerWidth, innerHeight) <= 480`). Phone visitors therefore see one still yacht on a teal sea from the open sea right through Noirmont, the pilot, the harbour, the berthing, the quay at work and the finale. No plotter, no video windows, no game doors, no services panel. This came over from the lab at seeding. The PC's "Phone view" button cannot imitate a touch screen, so it always showed the full scenes, which is why it was never noticed. Run on a phone-sized screen without the touch switch, the full scenes do render and mostly fit. They use the existing lighter setting (`RES` 192 on narrow screens).
   **Decided 13 Nov (Simon): a lighter phone version, built the same day.** On a phone, the sea scenes now show the journey's own film clips, one after another, full width, each with its caption above, on a blurred copy of the picture: Some places you pull in (the yacht on the sea), Pilot aboard (Corbière to Noirmont), The Small Roads, The entrance, The berth, The quay at work, Leaving St Helier. The scroll after the clouds is about 23 screens instead of about 208. Code: `_beats/_shared/phone-film.js` and `.css`, the `phone:` list in each of the three `beat.js` files, and `PHONE_JOURNEY` in `index.html`, which shortens the three tracks on phones. Data saver or a slow connection shows the still pictures with a play button. Still to do: Simon tries it on his own phone (it can only be seen on a real touch screen; the PC's Phone view shows the full scenes).
2. **The opening globe on a phone.**
   - The intro paragraph sits over the globe's dots and is hard to read.
   - The "Swipe to rotate · scroll to move on" hint overlaps the bottom-right card.
   - After "Scroll to start the journey", the voyage card and "Scroll to continue" sit on top of the intro text, and the map labels (CHANNEL ISLANDS) run through it.
   - Sideways: the headline is hidden under the header, and the four cards cover the two buttons.
3. **If the full scenes go on phones (1a), the scene panels need a phone layout:**
   - The video window and the chart plotter stack in the bottom-left and cover a third of the screen.
   - The alongside services panel covers the yacht at the quay.
   - "Take the helm: the berthing" overlaps the plotter.
4. **Review form: the stars are about 20 px wide** (`review/`, `.stars .s`), fiddly to tap. A captain is likely to answer on a phone. Make them larger and put them under each question on phones.
5. **Contact block: the email address runs off the screen at 360 px wide** (home and yachting page, "Email dutyagent@cips.agency" beside its label). Put the label above the value on phones.
6. **"Back to the globe · Play the CIPS journey" pill** wraps to three lines on a phone.
7. **Smaller points:**
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
