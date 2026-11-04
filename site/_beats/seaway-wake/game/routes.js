// Extracted from BRING_HER_IN_BASELINE_01. Keep behaviour-equivalent.
export const ROUTES = {
  ferryIn:  [[49.1780, -2.3100], [49.1709, -2.2514], [49.1683, -2.2242], [49.1645, -2.1804], [49.1624, -2.1447], [49.1629, -2.1300]],   // St Malo → St Helier by the North West / Western Passage
  ferryOut: [[49.1604, -2.1300], [49.1599, -2.1447], [49.1620, -2.1804], [49.1658, -2.2242], [49.1684, -2.2514], [49.1755, -2.3100]],   // her own side of the channel: 0.15 M south of the inbound line, port to port
  iuIn:     [[49.2150, -2.3200], [49.1850, -2.2850], [49.1709, -2.2514], [49.1683, -2.2242], [49.1645, -2.1804], [49.1624, -2.1447], [49.1629, -2.1300]],   // Guernsey → past Corbière → St Helier
  potter:   [[49.1760, -2.2440], [49.1735, -2.2300], [49.1720, -2.2150], [49.1745, -2.2000], [49.1720, -2.2150], [49.1735, -2.2300]],   // the string along the coast, back and forth
  tuna:     [[49.1560, -2.2700], [49.1520, -2.2300], [49.1500, -2.1900]],                                                                // offshore, south of the line
  taxiRun:  [[49.1830, -2.1960], [49.1760, -2.1940], [49.1680, -2.1900], [49.1640, -2.1780], [49.1600, -2.1660], [49.1640, -2.1300], [49.1715, -2.1180], [49.1640, -2.1300], [49.1600, -2.1660], [49.1640, -2.1780], [49.1680, -2.1900], [49.1760, -2.1940], [49.1830, -2.1960]],   // Ouaisné ↔ St Helier round Noirmont, every leg in the water (checked against the coast mask, 18 Sep)
  pod:      [[49.1560, -2.2450], [49.1680, -2.2350], [49.1720, -2.2200], [49.1600, -2.2000]],
  // the polish (18 Sep): the lifeboat's exercise out past Noirmont and back, the coastguard's inshore patrol, the cruise tender
  // St Helier ↔ the anchorage, the SHYC course off St Aubin (a loop), the RCIYC dinghies' triangle in St Aubin's Bay (a loop),
  // the kayaker along the Portelet shore (a loop), the trawler's tow offshore, the open boat drifting off Les Fours
  lifeboat: [[49.1770, -2.1200], [49.1600, -2.1500], [49.1500, -2.1900], [49.1600, -2.1500], [49.1770, -2.1200]],
  cgpatrol: [[49.1715, -2.1180], [49.1640, -2.1300], [49.1600, -2.1660], [49.1680, -2.1820], [49.1600, -2.1660], [49.1640, -2.1300], [49.1715, -2.1180]],
  tender:   [[49.1500, -2.1100], [49.1620, -2.1150], [49.1715, -2.1180], [49.1620, -2.1150], [49.1500, -2.1100]],
  shyc:     [[49.1850, -2.1350], [49.1700, -2.1500], [49.1600, -2.1350], [49.1720, -2.1250]],   // St Aubin's Bay to a mark off Noirmont and back
  rciyc:    [[49.1850, -2.1500], [49.1790, -2.1600], [49.1800, -2.1380]],
  kayak:    [[49.1700, -2.1900], [49.1690, -2.1960], [49.1670, -2.2000]],
  tow:      [[49.1450, -2.2600], [49.1480, -2.2000], [49.1450, -2.1500]],
  drift:    [[49.1520, -2.1640], [49.1525, -2.1600]]                                                                  // the dolphins: once, south-west to north-east across the line
};
export const SCHED = [   // when (s after cast off) · what · route · speed (units/s) · notes   // 15 Oct 2026, Simon: the head-on DFDS ferries (ferryOut, at 2 s and 70 s) are taken out; the one coming up astern (ferryIn) stays
  { at: 6, kind: 'potter', route: 'potter', speed: 2.2 }, { at: 8, kind: 'tuna', route: 'tuna', speed: 3 },
  { at: 14, kind: 'dfds', route: 'ferryIn', speed: 8.5 }, { at: 22, kind: 'pod', route: 'pod', speed: 8 }, { at: 30, kind: 'taxi', route: 'taxiRun', speed: 12 },
  { at: 38, kind: 'iu', route: 'iuIn', speed: 15 }, { at: 55, kind: 'taxi', route: 'taxiRun', speed: 12 },
  // the polish: the rest of the line (all speeds are the game's — theatre; the live layer is the truth)
  { at: 0, kind: 'cruise', fixed: [49.1500, -2.1080], hdg: 200 }, { at: 3, kind: 'shoal', fixed: [49.1535, -2.1620], hdg: 0 }, { at: 1, kind: 'shyc', route: 'shyc', speed: 3.2, loop: true }, { at: 1, kind: 'rciyc', route: 'rciyc', speed: 2.2, loop: true },
  { at: 1, kind: 'kayak', route: 'kayak', speed: 0.7, loop: true }, { at: 4, kind: 'trawler', route: 'tow', speed: 1.8 }, { at: 5, kind: 'openboat', route: 'drift', speed: 0.2, loop: true },
  { at: 10, kind: 'tender', route: 'tender', speed: 9, loop: true }, { at: 18, kind: 'lifeboat', route: 'lifeboat', speed: 10 }, { at: 26, kind: 'cgrib', route: 'cgpatrol', speed: 11, loop: true },
  { at: 46, kind: 'superyacht', route: 'ferryOut', speed: 4.5 }, { at: 90, kind: 'ropax', route: 'ferryIn', speed: 5.5 }, { at: 130, kind: 'dfds', route: 'ferryIn', speed: 8.5 } ];
SCHED.sort((a, b) => a.at - b.at);   // the spawner walks the list in order
