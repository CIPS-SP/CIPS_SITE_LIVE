// Extracted from BRING_HER_IN_BASELINE_01. Keep behaviour-equivalent.
export const GEO = {
  /* THE NORTH WEST PASSAGE, as the Ports of Jersey Pilotage Directions give it (Howard, 16 Sep — "Pilotage directions and general
     syllabus and information for Jersey", cdn.ports.je; not for navigation here, a training picture):
     · "Steer to pass 1.0 nm West of Corbière Lighthouse"; when the lighthouse transits the FIXED RED LIGHT (079° × 0.42 M from the
       lighthouse, vis 5 M) "steer 110° for 1.0 nm to pass 0.6 nm South of Corbière Light"
     · "When Corbière Lighthouse bears North, alter course to 095° for 2.15 nm to pass 0.4 nm South of La Moye Point"
     · the pilot boarding place from the West: 49°10'.10N 002°13'.45W, 4 cables south of La Moye Point
     · Anchorage No 4, the Pilotage Waiting Anchorage: 49°10'.20N 002°12'.35W, 15 m, max draught 13.0 m
     · La Corbière: "Isophase W.R. 10s. 36m W18M R16M — white from the land eastward of the light to 294°, red to 328°, white to
       148°, red to the land NE of the light"
     · dangers north of the track: Green Rock 3.0 m, Boîteaux dries 3.0 m, Noirmontaise reef dries 1.5 m; off La Moye: Western Head
       of Kaines dries 4.3 m, Aiguillon dries 10.4 m, Les Kaines dries 8.5 m, Fournier 0.9 m, Fourche 3.4 m; clearing: Corbière
       Lighthouse open south of Jument clears Western Head of Kaines
     · VHF: Jersey Coastguard Ch 82 / 25 an hour before arrival; St Helier VTS Ch 14; reporting point crossing S and E of
       49°12'.0N 002°18'.0W with position and ETA; pilotage compulsory in the district — pleasure vessels under 35 m exempt
     · tide: 3 M west of Corbière the stream sets NE at HW, NW at half ebb, SW at LW, SE at half flood; range 4.0 m neaps – 12.0 m springs
     ONWARDS FROM THE PILOT STATION (Simon, 25 Sep — from the full pilotage textbook, studied in full for this): "When Corbière
     Lighthouse is seen touching La Moye Point, steer 110° for 1.0 nm to pass 0.2 nm SW of Le Fret Point. Alter course as
     necessary to merge with the Western Passage Leading Marks" (Mont Ubé / Grève d'Azette / Dog's Nest in transit 082°/262°,
     length 3.0 nm) — "after passing the Ruaudière Buoy" (real fix, seamarks.json: 49.16222N 2.1434W) "Ruaudière Buoy to East
     Rock Buoy 0.9nm" (real fix 49.16598N 2.12141W — 0.89 nm apart here, confirming the two real buoys) she shapes up to enter
     "the Small Road 022°/202°" (length 1.05 nm, between the East and West La Cloche) — "after passing the Platte Beacon the
     Leading Mark can be opened slightly to the West to shape the vessel up for the Pier Head approach (Pier Head lead, fixed
     Green lights 078°/258°)". Past the boarding place the directions give bearings and distances between named buoys, not fixed
     positions, so this leg is dead reckoned exactly as they read (same one-leg-per-instruction method as WP1–WP3) but anchored
     to the two real charted buoy fixes above where the document names them, landing the Small Road turn within 0.03 nm of St
     Helier's real harbour-entrance position — a training picture for the plotter, to be checked against the real chart, not a
     replacement for it. Anchorage No 4 remains charted as a mark (below) — the Pilotage Waiting Anchorage, not a waypoint on the
     passage plan; she now runs pilot station to Le Fret to the leading lines in to port. */
  route: [[49.1794, -2.2873], [49.1709, -2.2514], [49.1683, -2.2242], [49.1626, -2.2002]],   // WP1: 1.0 M W of Corbière on the red-light transit · WP2: 110° 1.0 M, Corbière bears N · WP3: 095°, the pilot boarding place · WP4: 110° 1.0 M, 0.2 M SW of Le Fret Point — the ship's own track ends here, on station; the pilotage on into port continues as the grey line below
  names: ['1 M W of Corbière', 'Corbière bears N', 'Pilot boarding', '0.2 M SW Le Fret Pt'],
  pilotage: [[49.1766, -2.2753], [49.1709, -2.2514], [49.1683, -2.2242], [49.1626, -2.2002], [49.16222, -2.1434], [49.16598, -2.12141], [49.1814, -2.1119], [49.1824, -2.1044]],   // the pilotage route on into St Helier, in grey: 110° to 0.2 M SW Le Fret · merge onto the Western Passage 082° to the real Ruaudière Buoy fix · to the real East Rock Buoy fix (0.9nm, matches the directions) · 022° the Small Road to Platte Beacon · 078° the Pier Head lead
  redLight: { at: [49.1811, -2.2398], chr: 'F R 5M', note: '079° × 0.42 M from the lighthouse — the transit that starts the 110° leg' },
  tide: { label: 'Half flood · stream setting SE 1.5 kn', dir: 135, kn: 1.5 },   // the scenario's tide, from the directions' table 3 M west of Corbière; the set pushes her off the line unless the helm allows for it
  corbiere: { at: [49.1798, -2.2503], chr: 'Iso WR 10s', period: 10, range: 18, sectors: [[247, 294, 'W'], [294, 328, 'R'], [328, 148, 'W'], [148, 247, 'R']] },
  chart: { src: 'assets/game/chart-plate.webp', meta: 'assets/game/chart-plate.json', marks: 'assets/game/seamarks.json' },
  coast: [[49.1947, -2.2639], [49.191, -2.2599], [49.1869, -2.2576], [49.1832, -2.2552], [49.1796, -2.2496], [49.1788, -2.2424], [49.178, -2.2361], [49.177, -2.2281], [49.1767, -2.2234], [49.1749, -2.2202], [49.1759, -2.2154], [49.178, -2.2107], [49.1811, -2.2083], [49.1832, -2.2043], [49.1837, -2.1995], [49.1822, -2.1955], [49.1796, -2.1924], [49.178, -2.1884], [49.177, -2.1852], [49.1728, -2.182], [49.1707, -2.1789], [49.1697, -2.1725], [49.1707, -2.1661], [49.1728, -2.163], [49.178, -2.1598], [49.1822, -2.1566], [49.1832, -2.1526], [49.1843, -2.1447], [49.1884, -2.1359]],
  marks: [
    { k: 'light', at: [49.1798, -2.2503], name: 'Corbière', chr: 'Iso WR 10s' }, { k: 'rock', at: [49.1806, -2.2599], name: 'Noirmontaise dr 1.5' }, { k: 'rock', at: [49.1835, -2.2655], name: 'Boîteaux dr 3.0' },
    { k: 'pilot', at: [49.1683, -2.2242], name: 'Plt S. Helier West' }, { k: 'anch', at: [49.1700, -2.2058], name: 'No 4 · 15m · max dft 13' },
    { k: 'ncard', at: [49.1593, -2.2087], name: 'VQ' }, { k: 'wk', at: [49.1556, -2.2281], name: 'Wk' }, { k: 'rock', at: [49.1745, -2.2194], name: 'Aiguillon dr 10.4' },
    { k: 'light', at: [49.1666, -2.1685], name: 'Portelet Ledge', chr: 'Fl(4) 12s' }, { k: 'ncard', at: [49.1598, -2.1693], name: 'Les Fours Q' },
    { k: 'moor', at: [49.1824, -2.2075] }, { k: 'moor', at: [49.1817, -2.2035] }, { k: 'moor', at: [49.1806, -2.1995] }, { k: 'moor', at: [49.1796, -2.1963] },
    { k: 'label', at: [49.1772, -2.2245], name: 'Point La Moye' }, { k: 'label', at: [49.1855, -2.2035], name: "St Brelade's Bay" }, { k: 'label', at: [49.176, -2.1795], name: 'Point Le Fret' },
    { k: 'label', at: [49.174, -2.117], name: 'Small Road' }, { k: 'label', at: [49.184, -2.098], name: 'St Helier' }
  ],
  plate: { src: 'assets/game/sw-plate.webp', w: 5376, h: 3072, mPerPx: 1.5616, bounds: { west: -2.28515625, east: -2.1697998046875, north: 49.19606400072378, south: 49.15296965617039 } }
};
