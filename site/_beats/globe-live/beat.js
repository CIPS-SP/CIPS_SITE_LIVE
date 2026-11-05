/* _beats/globe-live/beat.js — brought in from Howard's HLC Globe Lab (CIPS/HLC-globe-lab), 15 Sep 2026; the live AIS
   layer, status pill, click-a-ship and the captain's picker (./live.js) merged back in on 16 Sep 2026 behind one option:
   `ais` — null/false = the globe alone (every use of `live` is guarded, so it degrades to "off"); an object such as
   { BUFFER_URL: 'https://hlc-ais-buffer.fly.dev' } = live traffic from that always-on buffer (no key ever in the page).
   Simon's Kinship marker + callout (15 Sep) are kept unchanged. One continuous scroll-driven zoom that replaces globe-dotmatrix AND
   channel-night — dot-matrix globe → drawn coastline → real night-aerial city lights draped on the sphere → a
   second deep zoom straight onto Jersey with channel-night's own HD plate — plus Kinship on her own track.
   Original file: HLC Globe Lab fork of globe-dotmatrix (live AIS + density + captain picker lived in ./live.js,
   not brought over here). Base: Atlantic Gateway opening globe: dot-matrix land, orange/blue polar glow, comet arcs
   converging on the Channel Islands. UC technique, our palette. Ported verbatim from atlantic-gateway/globe-dots.html
   (2026-08-21); only the scroll source and DOM scoping changed.
   Choreography (p over the beat's track): 0–.33 idle spin · .33–.66 fly in + settle on the islands · .55–.78 chart in · .70–1 zoom into Jersey. */
import * as THREE from 'three152';
import { OrbitControls } from 'three152/addons/controls/OrbitControls.js';
import * as topojson from 'topojson-client';
import { CSS2DRenderer, CSS2DObject } from 'three152/addons/renderers/CSS2DRenderer.js';
import { initLive } from './live.js?v=44';   // the live AIS layer, the status pill, click-a-ship and the captain's picker — on only when options.ais is set

export const meta = { order: 1, title: "Globe — live sphere zoom (AIS optional)", site: "CIPS", summary: "The dot-matrix globe flying in, then one continuous zoom — drawn coastline, real night-aerial lights, the HD Jersey plate — replacing globe-dotmatrix + channel-night. Brought in from Howard's HLC Globe Lab, 15 Sep 2026, with the live AIS feed/picker left out." };
export const defaults = {
  trackHint: '400vh',
  northUp: false,  // true: the fly-in settles with north straight up (the natural map orientation, so the next beat's satellite
                   // map needs no roll). false = the original arbitrary roll (Atlantic Gateway pages).
  fadeOut: true,   // fade the dots/glow/labels out over the last 10 % of the slice. Set false when the NEXT beat crossfades over us
                   // (runtime fadePrev) and wants the final frame — islands as one orange dot — held to the very end (CIPS: channel-night).
  ais: null,       // live traffic: null = off; { BUFFER_URL: 'https://…' } = read the always-on AIS buffer (ships, tracks, the picker,
                   // click-a-ship, the status pill). Other keys (DENSITY_GRID, TRAILS, SIM_SHIPS …) pass straight through to live.js.
};
export async function mount(stage, o, ctx){
  // 3 Oct 2026, Simon: callout cards move into the ship finder (see the .lvoyage slot in beat.html) — set before live.js builds its own callout
  const VOYAGE_CARD_IN_FINDER = o.voyageCardInFinder !== false;
  if (VOYAGE_CARD_IN_FINDER) stage.classList.add('vcard-panel');
  let __p = 0;
  const img = stage.querySelector('img.imap'); if (img && img.dataset.src) img.src = ctx.base + img.dataset.src;

  
  /* ============================================================
     CFG — every dial in one place (tune freely)
     ============================================================ */
  const CFG = {
    radius: 1,
    cameraZ: 2.9,
    fov: 55,
  
    // land matrix (one grid; coastline = boundary cells)
    tileDeg: 0.8,          // grid spacing (deg) — smaller = denser (1.2 -> 0.8 ~ 2x frequency)
    latMin: -60,           // clip Antarctica (open ocean south of South America)
    latMax: 84,            // top of the northern landmasses
    sizeScale: 1.35,       // global dot-size multiplier
  
    // interior land dots — the fill of the matrix
    fillColor: 0xeef2f7,   // brighter slate
    fillSize: 0.00375,
    fillOpacity: 0.62,     // lifted for more light
    fillAdditive: false,
  
    // coastline dots — same grid, boundary cells, lit brighter + additive so they sparkle
    edgeColor: 0xffffff,   // white
    edgeSize: 0.006,
    edgeOpacity: 1.0,
    edgeAdditive: true,
  
    killBack: true,        // UC killBack — front hemisphere only
    backOpacity: 0.15,     // UC backOpacity (used only if killBack=false)
    dotRimBoost: 1.1,      // brighten land dots toward the globe's edge (brighter limb, like UC)
  
    autoRotateSpeed: 0.86, // matches UC's ~5.2 deg/s (o=0.0015 rad/frame); ~70s per turn
    damping: 0.05,
  
    // arcs (United Carriers comet technique)
    arcColor: 0xF45300,    // UC orange
    arcThickness: 0.0022,      // tube radius (world view)
    arcThicknessNear: 0.0008,  // thinner as we zoom in
    arcHeight: 0.025,      // peak lift (x great-circle angle) — lower = flatter
    arcSpeed: 0.0016,      // comet-clock increment per frame-unit
    endpointColor: 0xF45300,
    endpointSize: 0.017,    // endpoint dots (UC style — dots + names)
  
    // rim glow / atmosphere (two-tone fresnel halo, deep at each arc top -> thin at the meeting zones)
    glowWarm: 0xFF9E33,     // orange half (warmer/brighter, less red)
    glowCool: 0x6C9CFF,     // light blue half
    glowRadius: 0.975,      // pushed further INSIDE the dot shell so land rides on top
    glowWarmBearing: 10,    // bearing the warm half faces (0=up, clockwise); orange up, blue down, meet at 100 / 280 deg
    glowPowerTopWarm: 3.5,  // orange: thicker bright edge band
    glowCoolFade: 0.62,     // blue: fade-zone width (bigger = reaches further & dissolves smoothly into the bg)
    glowWarmBoost: 3.2,     // orange band brighter
    glowHotPower: 6.0,      // thicker white-hot core (whiter band, not a thin line)
    glowHotWarm: 1.0,       // orange edge blows fully to white
    glowHotCool: 0.82,      // blue edge = very light / whitish blue
    glowPowerMeet: 5.0,     // thin glow toward the meeting zones
    glowIntensity: 1.2,     // brightness
    glowMeetFade: 0.25,     // relative brightness at the meeting zones
    glowBlend: 0.3,         // colour transition width
  
    landUrl: new URL('../_vendor/world-atlas-2/land-110m.json', import.meta.url).href,
  
    // Channel Islands close-up (resolves in over the last part of the scroll)
    islandCenter: { lat: 49.42, lng: -2.35 },
    islandTileDeg: 0.011,       // fine grid for the archipelago
    islandScaleK: 2.3,          // world units per degree (sizes the islands on screen)
    islandFillColor: 0xe2e8f0, islandFillSize: 0.019, islandFillOpacity: 0.5,
    islandEdgeColor: 0xffffff, islandEdgeSize: 0.027, islandEdgeOpacity: 1.0
  };
  
  // Accurate Channel Islands coastlines (OSM, injected from opening.html) for the close-up
  let CIGEO = null; CIGEO = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Jersey"},"geometry":{"type":"Polygon","coordinates":[[[-2.2545,49.2495],[-2.2526,49.2492],[-2.2536,49.247],[-2.249,49.2425],[-2.2504,49.2424],[-2.2501,49.2397],[-2.247,49.241],[-2.2416,49.2379],[-2.2386,49.2332],[-2.23,49.224],[-2.2276,49.2193],[-2.2236,49.2067],[-2.2241,49.2004],[-2.2299,49.1888],[-2.2312,49.1876],[-2.2361,49.1871],[-2.236,49.1861],[-2.2339,49.1851],[-2.2347,49.1841],[-2.24,49.1836],[-2.2418,49.1821],[-2.2453,49.1822],[-2.2452,49.1814],[-2.2417,49.1808],[-2.2392,49.1785],[-2.2362,49.18],[-2.2352,49.1783],[-2.2345,49.1785],[-2.235,49.1775],[-2.2331,49.1777],[-2.2336,49.1768],[-2.2328,49.1772],[-2.2306,49.1763],[-2.2314,49.1757],[-2.2268,49.1751],[-2.2269,49.1745],[-2.2255,49.1753],[-2.2257,49.1745],[-2.2241,49.1742],[-2.2214,49.1756],[-2.2199,49.175],[-2.2138,49.1778],[-2.2088,49.1771],[-2.2081,49.1794],[-2.2045,49.1781],[-2.2042,49.1812],[-2.2007,49.1825],[-2.2022,49.1831],[-2.2018,49.1841],[-2.1962,49.1845],[-2.1916,49.1832],[-2.1904,49.1824],[-2.1906,49.1815],[-2.1886,49.1815],[-2.1859,49.1784],[-2.1858,49.1765],[-2.1888,49.1758],[-2.1864,49.1716],[-2.1895,49.1693],[-2.1869,49.1688],[-2.1847,49.1696],[-2.1833,49.169],[-2.181,49.1716],[-2.1782,49.1717],[-2.1751,49.1712],[-2.1748,49.1696],[-2.1735,49.1687],[-2.1713,49.1687],[-2.1713,49.1662],[-2.1681,49.1657],[-2.166,49.1675],[-2.1636,49.1719],[-2.1648,49.174],[-2.164,49.1749],[-2.1679,49.176],[-2.168,49.1772],[-2.1696,49.1783],[-2.1677,49.1807],[-2.1686,49.181],[-2.168,49.182],[-2.1696,49.1824],[-2.1695,49.1834],[-2.1666,49.1867],[-2.1686,49.1855],[-2.1701,49.1869],[-2.167,49.1869],[-2.1692,49.1883],[-2.1682,49.1907],[-2.1659,49.1929],[-2.1617,49.1948],[-2.1481,49.197],[-2.1329,49.1952],[-2.129,49.194],[-2.1187,49.1883],[-2.1163,49.1857],[-2.1193,49.1805],[-2.1175,49.1839],[-2.1157,49.1833],[-2.1152,49.1808],[-2.1187,49.1805],[-2.1193,49.1797],[-2.117,49.1766],[-2.1183,49.1787],[-2.1144,49.1792],[-2.1141,49.1767],[-2.1139,49.1793],[-2.1123,49.1815],[-2.1112,49.1829],[-2.1096,49.1824],[-2.1125,49.1789],[-2.1116,49.1787],[-2.1095,49.1815],[-2.1086,49.1812],[-2.1099,49.1791],[-2.1089,49.1786],[-2.1107,49.1781],[-2.1102,49.1774],[-2.1124,49.1781],[-2.1111,49.1771],[-2.111,49.1758],[-2.1147,49.1762],[-2.1144,49.1753],[-2.1126,49.1754],[-2.1124,49.1745],[-2.1158,49.1742],[-2.1157,49.1757],[-2.1165,49.1743],[-2.1141,49.1735],[-2.1148,49.1725],[-2.1174,49.173],[-2.116,49.1706],[-2.1124,49.168],[-2.11,49.1681],[-2.1073,49.1696],[-2.1073,49.1723],[-2.1062,49.1735],[-2.1073,49.1746],[-2.1067,49.1758],[-2.0991,49.1772],[-2.0971,49.1763],[-2.0954,49.1768],[-2.0919,49.1752],[-2.078,49.1631],[-2.0707,49.1632],[-2.0715,49.1646],[-2.0687,49.1668],[-2.0619,49.1667],[-2.057,49.169],[-2.0531,49.1694],[-2.0396,49.1664],[-2.0317,49.1625],[-2.0334,49.1635],[-2.0333,49.1647],[-2.0282,49.167],[-2.0331,49.1817],[-2.0336,49.1869],[-2.0325,49.1921],[-2.0291,49.1972],[-2.0207,49.1997],[-2.0203,49.1987],[-2.0223,49.1967],[-2.0176,49.1996],[-2.0183,49.2014],[-2.017,49.2017],[-2.0194,49.2038],[-2.0218,49.2041],[-2.0221,49.2065],[-2.02,49.2089],[-2.0243,49.2092],[-2.0247,49.2117],[-2.0228,49.2123],[-2.0259,49.2122],[-2.029,49.2149],[-2.0298,49.2161],[-2.0296,49.2185],[-2.0263,49.2199],[-2.0266,49.2215],[-2.0238,49.2234],[-2.0195,49.2245],[-2.0104,49.2222],[-2.0229,49.2256],[-2.0241,49.2267],[-2.0242,49.2297],[-2.0258,49.2319],[-2.0245,49.2323],[-2.0249,49.233],[-2.0262,49.2332],[-2.0274,49.2322],[-2.0314,49.2328],[-2.0352,49.2353],[-2.0362,49.234],[-2.0389,49.2356],[-2.0448,49.2359],[-2.0458,49.2372],[-2.0442,49.2374],[-2.045,49.2384],[-2.0435,49.2401],[-2.0473,49.2393],[-2.0508,49.2404],[-2.0516,49.2437],[-2.0527,49.2418],[-2.0541,49.2423],[-2.0563,49.2411],[-2.0571,49.2393],[-2.0639,49.2392],[-2.0644,49.2381],[-2.0668,49.2386],[-2.0676,49.2368],[-2.073,49.2362],[-2.0815,49.2385],[-2.0819,49.2395],[-2.0803,49.2407],[-2.0817,49.2405],[-2.0829,49.2418],[-2.0837,49.2446],[-2.0856,49.2464],[-2.0848,49.2481],[-2.0868,49.2473],[-2.0899,49.2492],[-2.0912,49.2501],[-2.0915,49.2529],[-2.0931,49.2538],[-2.097,49.2534],[-2.0986,49.255],[-2.1015,49.2551],[-2.1035,49.2536],[-2.1046,49.2502],[-2.1092,49.2497],[-2.1118,49.2519],[-2.1134,49.2502],[-2.1167,49.2498],[-2.1209,49.251],[-2.121,49.2521],[-2.1195,49.2517],[-2.1207,49.2522],[-2.1203,49.2532],[-2.1213,49.2539],[-2.1258,49.2529],[-2.1288,49.2534],[-2.1292,49.2543],[-2.1295,49.2534],[-2.1357,49.2529],[-2.1392,49.2535],[-2.1418,49.256],[-2.1452,49.2564],[-2.1468,49.2593],[-2.1514,49.2605],[-2.1524,49.2621],[-2.1529,49.2604],[-2.1561,49.2598],[-2.1606,49.2615],[-2.1595,49.258],[-2.1642,49.2574],[-2.1655,49.2585],[-2.1684,49.2551],[-2.1703,49.2549],[-2.17,49.2536],[-2.1743,49.2518],[-2.1742,49.2493],[-2.1799,49.2507],[-2.1832,49.2471],[-2.1843,49.2484],[-2.1862,49.2486],[-2.1863,49.25],[-2.1886,49.2488],[-2.1888,49.2476],[-2.1906,49.2489],[-2.1908,49.2482],[-2.1927,49.2487],[-2.1937,49.2502],[-2.1946,49.2476],[-2.1963,49.247],[-2.1971,49.2488],[-2.1988,49.2483],[-2.1994,49.247],[-2.2028,49.2474],[-2.2031,49.2489],[-2.2067,49.2502],[-2.2071,49.2522],[-2.2098,49.2514],[-2.2114,49.2543],[-2.2128,49.2536],[-2.2157,49.2551],[-2.2178,49.2545],[-2.2184,49.2558],[-2.2204,49.2553],[-2.2204,49.2563],[-2.2221,49.2575],[-2.2273,49.2587],[-2.2262,49.2597],[-2.227,49.2597],[-2.2263,49.2604],[-2.2273,49.2613],[-2.2276,49.2599],[-2.23,49.2595],[-2.2301,49.2587],[-2.228,49.2585],[-2.2297,49.2579],[-2.2283,49.2567],[-2.2301,49.257],[-2.2294,49.2566],[-2.2313,49.256],[-2.2397,49.257],[-2.2402,49.258],[-2.2419,49.2577],[-2.2437,49.2589],[-2.245,49.258],[-2.247,49.2585],[-2.2479,49.2579],[-2.2474,49.2565],[-2.249,49.2565],[-2.2497,49.255],[-2.2515,49.2552],[-2.2512,49.2542],[-2.2536,49.2526],[-2.2533,49.2505],[-2.2545,49.2495]]]}},{"type":"Feature","properties":{"name":"Guernsey"},"geometry":{"type":"Polygon","coordinates":[[[-2.6752,49.4327],[-2.6743,49.4294],[-2.6734,49.429],[-2.6735,49.4298],[-2.6727,49.4278],[-2.6711,49.4276],[-2.6706,49.4265],[-2.6687,49.4267],[-2.6686,49.4252],[-2.6669,49.4239],[-2.6656,49.4256],[-2.6641,49.4247],[-2.6648,49.4244],[-2.6638,49.4232],[-2.6632,49.4253],[-2.6618,49.4231],[-2.6593,49.4245],[-2.657,49.4235],[-2.6528,49.425],[-2.6512,49.424],[-2.6485,49.4262],[-2.6465,49.4263],[-2.6468,49.4252],[-2.6444,49.4264],[-2.6431,49.4246],[-2.6399,49.4246],[-2.6382,49.4228],[-2.6336,49.4238],[-2.6307,49.4222],[-2.6278,49.4225],[-2.6267,49.4213],[-2.6277,49.4212],[-2.6273,49.4207],[-2.6227,49.4209],[-2.6191,49.4188],[-2.6182,49.4198],[-2.6168,49.4189],[-2.617,49.4196],[-2.6136,49.4203],[-2.6139,49.4182],[-2.6117,49.4177],[-2.6107,49.4187],[-2.6114,49.4195],[-2.6102,49.419],[-2.6103,49.4198],[-2.6079,49.4204],[-2.6051,49.4189],[-2.6028,49.4198],[-2.6016,49.418],[-2.6008,49.4188],[-2.5936,49.4187],[-2.5936,49.4173],[-2.5929,49.4177],[-2.5915,49.4164],[-2.5906,49.4172],[-2.5924,49.4194],[-2.5916,49.4194],[-2.592,49.4205],[-2.5863,49.42],[-2.5844,49.4218],[-2.5833,49.4206],[-2.5825,49.4219],[-2.5836,49.4238],[-2.5816,49.4236],[-2.5825,49.4253],[-2.5818,49.4257],[-2.5796,49.425],[-2.5791,49.4228],[-2.5784,49.4254],[-2.5776,49.4241],[-2.5754,49.4237],[-2.5746,49.4244],[-2.5734,49.4234],[-2.5717,49.4233],[-2.5701,49.4248],[-2.5697,49.4241],[-2.5705,49.4238],[-2.5692,49.4227],[-2.5667,49.4229],[-2.5669,49.4196],[-2.5637,49.418],[-2.5642,49.4174],[-2.563,49.4169],[-2.5632,49.4155],[-2.5618,49.417],[-2.5606,49.417],[-2.5616,49.4175],[-2.5594,49.4179],[-2.5595,49.4199],[-2.5577,49.4187],[-2.556,49.4204],[-2.5554,49.4199],[-2.5581,49.4221],[-2.5581,49.4234],[-2.5543,49.4218],[-2.5526,49.4225],[-2.5526,49.4218],[-2.5527,49.4244],[-2.5501,49.4233],[-2.5472,49.4256],[-2.5478,49.4268],[-2.5464,49.4276],[-2.5462,49.4262],[-2.5447,49.4256],[-2.5426,49.426],[-2.5414,49.425],[-2.5379,49.4258],[-2.5403,49.423],[-2.5403,49.4208],[-2.5412,49.4197],[-2.5389,49.42],[-2.5394,49.4178],[-2.5374,49.4181],[-2.5372,49.4192],[-2.536,49.4191],[-2.5347,49.4205],[-2.5316,49.4191],[-2.5324,49.4206],[-2.5307,49.4214],[-2.5313,49.4232],[-2.5294,49.423],[-2.5281,49.4216],[-2.529,49.4237],[-2.528,49.424],[-2.5294,49.4239],[-2.5301,49.4276],[-2.5327,49.4288],[-2.5314,49.4299],[-2.5332,49.4302],[-2.5337,49.433],[-2.5371,49.4347],[-2.5355,49.4365],[-2.5337,49.4359],[-2.5344,49.4388],[-2.533,49.4421],[-2.5335,49.4446],[-2.533,49.4458],[-2.5295,49.4458],[-2.5305,49.4467],[-2.5295,49.4478],[-2.5322,49.4496],[-2.5354,49.4503],[-2.5356,49.4523],[-2.5278,49.4535],[-2.5258,49.452],[-2.5262,49.454],[-2.5242,49.4551],[-2.5284,49.4535],[-2.5318,49.4547],[-2.5326,49.4541],[-2.5317,49.4543],[-2.531,49.4532],[-2.5333,49.4529],[-2.5334,49.454],[-2.5334,49.4528],[-2.5353,49.4528],[-2.5351,49.4543],[-2.5329,49.4544],[-2.5338,49.4555],[-2.5342,49.4546],[-2.5357,49.4547],[-2.5354,49.4562],[-2.5335,49.4557],[-2.5344,49.4564],[-2.5337,49.4576],[-2.5353,49.4564],[-2.5344,49.4581],[-2.5326,49.4582],[-2.5326,49.4574],[-2.5303,49.458],[-2.5293,49.4564],[-2.5291,49.458],[-2.5263,49.4562],[-2.5295,49.4617],[-2.5287,49.459],[-2.5338,49.4594],[-2.5326,49.4616],[-2.5302,49.4611],[-2.5358,49.4646],[-2.5359,49.4661],[-2.5336,49.4695],[-2.5338,49.4712],[-2.5276,49.4752],[-2.5201,49.4757],[-2.5157,49.4772],[-2.5119,49.4767],[-2.5083,49.4784],[-2.5078,49.48],[-2.5115,49.4801],[-2.513,49.4807],[-2.5125,49.4816],[-2.5174,49.4824],[-2.5165,49.483],[-2.5197,49.483],[-2.5165,49.4835],[-2.5137,49.4823],[-2.514,49.4831],[-2.5127,49.4833],[-2.5118,49.4818],[-2.512,49.4824],[-2.5081,49.4847],[-2.5091,49.487],[-2.5066,49.4883],[-2.5088,49.4901],[-2.5051,49.4907],[-2.5037,49.4901],[-2.5027,49.4966],[-2.5018,49.4975],[-2.5033,49.4993],[-2.5026,49.5],[-2.5045,49.501],[-2.5037,49.5032],[-2.5055,49.5047],[-2.5048,49.5057],[-2.5054,49.5061],[-2.5104,49.5044],[-2.5155,49.5052],[-2.5169,49.5081],[-2.5186,49.5091],[-2.5187,49.5074],[-2.5208,49.5054],[-2.5204,49.5038],[-2.523,49.5032],[-2.524,49.5018],[-2.5274,49.5019],[-2.534,49.5043],[-2.5311,49.5079],[-2.5349,49.5065],[-2.5371,49.5083],[-2.5395,49.5072],[-2.5428,49.5078],[-2.5438,49.5065],[-2.5482,49.5056],[-2.5474,49.5045],[-2.5439,49.5046],[-2.5408,49.503],[-2.5406,49.4995],[-2.5426,49.4976],[-2.5423,49.4957],[-2.5435,49.494],[-2.5418,49.4926],[-2.5442,49.4912],[-2.5465,49.4911],[-2.5482,49.4935],[-2.553,49.4944],[-2.5543,49.4959],[-2.5528,49.4983],[-2.556,49.4985],[-2.5582,49.4957],[-2.562,49.4948],[-2.5643,49.4968],[-2.5669,49.4961],[-2.5683,49.497],[-2.571,49.4967],[-2.5693,49.4962],[-2.5695,49.4947],[-2.5724,49.4929],[-2.5748,49.4944],[-2.576,49.493],[-2.5746,49.4918],[-2.5747,49.4902],[-2.5802,49.4891],[-2.5787,49.4881],[-2.5795,49.4872],[-2.5822,49.4868],[-2.5842,49.4882],[-2.5862,49.4873],[-2.5888,49.4884],[-2.59,49.4881],[-2.5866,49.4855],[-2.5885,49.4808],[-2.5914,49.4767],[-2.5959,49.4752],[-2.5997,49.4755],[-2.602,49.4743],[-2.6028,49.4749],[-2.6025,49.4731],[-2.6036,49.4724],[-2.6067,49.4741],[-2.6064,49.4752],[-2.6079,49.4754],[-2.61,49.474],[-2.6128,49.4747],[-2.6076,49.4732],[-2.6064,49.4713],[-2.607,49.468],[-2.6103,49.4654],[-2.6172,49.4635],[-2.6221,49.4632],[-2.6253,49.4643],[-2.6252,49.4656],[-2.6263,49.4669],[-2.6293,49.4675],[-2.6292,49.466],[-2.6321,49.464],[-2.631,49.4631],[-2.6315,49.462],[-2.6358,49.4589],[-2.6394,49.459],[-2.642,49.4611],[-2.6468,49.4605],[-2.6532,49.4573],[-2.6575,49.4587],[-2.6577,49.4572],[-2.6596,49.4558],[-2.6571,49.4559],[-2.6544,49.4543],[-2.653,49.4547],[-2.6503,49.4517],[-2.6492,49.4459],[-2.6509,49.4412],[-2.6538,49.4389],[-2.6543,49.4365],[-2.6574,49.4346],[-2.6641,49.4344],[-2.666,49.4363],[-2.6697,49.4355],[-2.6714,49.4373],[-2.6739,49.436],[-2.6752,49.4327]]]}},{"type":"Feature","properties":{"name":"Alderney"},"geometry":{"type":"Polygon","coordinates":[[[-2.2344,49.7095],[-2.2316,49.7085],[-2.2344,49.706],[-2.2312,49.7049],[-2.2339,49.7038],[-2.2326,49.7042],[-2.2328,49.7035],[-2.2312,49.703],[-2.2322,49.702],[-2.2306,49.7025],[-2.2282,49.7013],[-2.2275,49.7026],[-2.2259,49.703],[-2.2244,49.702],[-2.2228,49.7024],[-2.2219,49.7013],[-2.2172,49.7015],[-2.2169,49.7022],[-2.2134,49.7014],[-2.2019,49.7063],[-2.1983,49.7056],[-2.1923,49.7067],[-2.1875,49.7091],[-2.1882,49.7107],[-2.1862,49.7104],[-2.1868,49.7111],[-2.1811,49.7127],[-2.1814,49.7148],[-2.1789,49.715],[-2.1768,49.714],[-2.1753,49.7147],[-2.1752,49.7158],[-2.1729,49.7166],[-2.1728,49.7179],[-2.1756,49.7199],[-2.1751,49.7214],[-2.1719,49.7223],[-2.1659,49.7218],[-2.1596,49.7264],[-2.1593,49.7293],[-2.1673,49.7302],[-2.1691,49.729],[-2.1698,49.7304],[-2.1715,49.7285],[-2.1732,49.7286],[-2.1758,49.7302],[-2.1749,49.731],[-2.1768,49.7313],[-2.1776,49.7328],[-2.1786,49.7324],[-2.1779,49.7305],[-2.1804,49.7316],[-2.1792,49.7309],[-2.18,49.7305],[-2.1785,49.7301],[-2.1793,49.7289],[-2.1817,49.7287],[-2.1822,49.7298],[-2.185,49.7303],[-2.1855,49.7298],[-2.1843,49.7287],[-2.1862,49.728],[-2.1857,49.727],[-2.1871,49.7279],[-2.1867,49.7271],[-2.1885,49.7275],[-2.1882,49.7261],[-2.1856,49.7246],[-2.1861,49.7231],[-2.1895,49.7213],[-2.1934,49.7209],[-2.1987,49.7218],[-2.1993,49.7233],[-2.1981,49.7231],[-2.2001,49.7239],[-2.1999,49.7256],[-2.2019,49.7234],[-2.2033,49.725],[-2.2028,49.726],[-2.1946,49.7304],[-2.2044,49.7254],[-2.2053,49.7257],[-2.205,49.7242],[-2.2062,49.7245],[-2.2038,49.7224],[-2.2049,49.7214],[-2.2065,49.7213],[-2.2079,49.7225],[-2.2088,49.7222],[-2.2086,49.7213],[-2.2112,49.7208],[-2.2208,49.7204],[-2.2222,49.7159],[-2.2252,49.7143],[-2.2284,49.714],[-2.229,49.7117],[-2.2326,49.7099],[-2.2322,49.7094],[-2.2344,49.7095]]]}},{"type":"Feature","properties":{"name":"Sark"},"geometry":{"type":"Polygon","coordinates":[[[-2.3832,49.4138],[-2.3826,49.4119],[-2.3808,49.4127],[-2.3803,49.4108],[-2.3758,49.411],[-2.3784,49.4095],[-2.3766,49.409],[-2.3785,49.4083],[-2.3767,49.4076],[-2.375,49.4083],[-2.3755,49.4074],[-2.3732,49.408],[-2.3738,49.4088],[-2.3711,49.4091],[-2.3708,49.4101],[-2.3687,49.4107],[-2.3689,49.4147],[-2.3677,49.4161],[-2.3658,49.4164],[-2.3666,49.4179],[-2.3656,49.4202],[-2.3599,49.4219],[-2.3602,49.4234],[-2.3591,49.4241],[-2.356,49.424],[-2.3557,49.4223],[-2.3545,49.4225],[-2.3531,49.4237],[-2.353,49.4254],[-2.3513,49.4262],[-2.3497,49.4264],[-2.348,49.4238],[-2.3489,49.4229],[-2.3468,49.4236],[-2.3481,49.4251],[-2.3443,49.4284],[-2.3431,49.4281],[-2.3449,49.4288],[-2.3439,49.4291],[-2.3442,49.43],[-2.3434,49.4298],[-2.3438,49.4305],[-2.3429,49.4305],[-2.3432,49.4299],[-2.342,49.4305],[-2.3429,49.4313],[-2.3426,49.4327],[-2.3445,49.4319],[-2.344,49.4327],[-2.3458,49.433],[-2.3443,49.4342],[-2.3449,49.4351],[-2.344,49.4351],[-2.345,49.437],[-2.3467,49.4368],[-2.3492,49.4382],[-2.3497,49.4374],[-2.3523,49.4378],[-2.3535,49.4417],[-2.3542,49.4417],[-2.3532,49.4426],[-2.3542,49.4444],[-2.361,49.4448],[-2.3626,49.4464],[-2.3614,49.4477],[-2.3643,49.4471],[-2.3648,49.4489],[-2.3677,49.4491],[-2.3674,49.4478],[-2.366,49.4477],[-2.3671,49.4471],[-2.3656,49.4468],[-2.3668,49.4464],[-2.3661,49.4458],[-2.367,49.4459],[-2.3679,49.4442],[-2.3668,49.4439],[-2.3675,49.4428],[-2.3656,49.4419],[-2.3658,49.4406],[-2.3677,49.4403],[-2.3688,49.4385],[-2.3711,49.4382],[-2.3695,49.4373],[-2.3707,49.436],[-2.3694,49.4349],[-2.3722,49.434],[-2.375,49.4348],[-2.3764,49.4323],[-2.3787,49.4317],[-2.3766,49.4309],[-2.3763,49.4297],[-2.3744,49.4293],[-2.3756,49.4283],[-2.3774,49.4285],[-2.3765,49.4278],[-2.3771,49.4274],[-2.3735,49.4266],[-2.3741,49.426],[-2.3734,49.4252],[-2.3679,49.4259],[-2.3674,49.4251],[-2.3692,49.4237],[-2.3683,49.4224],[-2.3697,49.422],[-2.3677,49.4215],[-2.3675,49.4204],[-2.3704,49.4188],[-2.3729,49.4189],[-2.3737,49.4203],[-2.3734,49.419],[-2.374,49.4192],[-2.3732,49.4187],[-2.3739,49.4178],[-2.3754,49.4183],[-2.3784,49.4176],[-2.3798,49.4157],[-2.3832,49.4138]]]}},{"type":"Feature","properties":{"name":"Herm"},"geometry":{"type":"Polygon","coordinates":[[[-2.4579,49.4797],[-2.4521,49.4719],[-2.4527,49.4697],[-2.4543,49.4702],[-2.4528,49.4666],[-2.4534,49.4658],[-2.4516,49.4637],[-2.452,49.463],[-2.4449,49.4646],[-2.4449,49.4668],[-2.4432,49.4668],[-2.4442,49.4683],[-2.4409,49.4702],[-2.4449,49.4734],[-2.4445,49.4749],[-2.4484,49.4774],[-2.4481,49.4829],[-2.4579,49.4797]]]}}]};
  
  const statusEl = stage.querySelector('[data-g="status"]');
  const islandsEl = stage.querySelector('[data-g="islands"]');
  const regionEl = stage.querySelector('[data-g="region"]');
  let regionSvg = null;
  const globeGlowEl = stage.querySelector('[data-g="globeglow"]');
  const hintEl = stage.querySelector('[data-g="hint"]');

  /* ---------- Voyage Planner Phase 2 (16 Sep 2026): entry CTA + scroll gate ----------
     Nothing scrolls into the fly-in until a captain clicks the CTA — dragging/orbiting the globe still works throughout,
     only the page's own scroll is held. Bypassed automatically for `?goto=` deep links so the existing reviewer
     shortcut keeps working. `document.body.style.overflow` is the one deliberate exception to this file otherwise
     never touching anything outside its own stage — there's no other way to hold page scroll from inside a beat.
     17 Sep 2026 (Simon): the CTA used to reveal a two-button choice (use example / find your ship); it now opens the
     ship finder (.lpanel) directly — "find a ship" is just using the search box that was already there, and "use an
     example vessel" moved from that choice screen into the finder itself (button under the search box, beat.html). */
  const voyageCta = stage.querySelector('[data-g="voyageCta"]'), voyageCtaBtn = stage.querySelector('[data-g="voyageCtaBtn"]');
  const voyageExampleBtn = stage.querySelector('[data-g="voyageExample"]');
  const VOYAGE_EXAMPLE_LABEL = voyageExampleBtn?.textContent;   // "Use example vessel instead" — restored if the captain backs out via the X and comes back
  const voyageMonitorBtn = stage.querySelector('[data-g="voyageMonitor"]');
  const VOYAGE_MONITOR_LABEL = voyageMonitorBtn?.textContent;   // "Channel Islands Monitor" (17 Sep 2026) — same restore-on-X pattern as the example button
  const voyagePanelClose = stage.querySelector('[data-live="panelClose"]');
  const voyageReopenBtn = stage.querySelector('[data-g="voyageReopenPanel"]');
  const VOYAGE_REOPEN_LABEL = voyageReopenBtn?.textContent;   // "Change ship" — swapped for "Find a ship to take in" while voyageMonitorMode is active (tick(), below)
  const voyageEnterBtn = stage.querySelector('[data-g="voyageEnterApproaches"]');
  const voyageFinderPanel = stage.querySelector('[data-live="panel"]');
  const voyageSlot = stage.querySelector('[data-g="voyageSlot"]'), voyageChangeBtn = stage.querySelector('[data-g="voyageChange"]'), voyageToggleBtn = stage.querySelector('[data-g="voyageToggle"]');
  const voyageHeadB = stage.querySelector('.lpanel .lhead b'), VOYAGE_HEAD_LABEL = voyageHeadB?.textContent;
  const voyageCue = stage.querySelector('[data-g="voyageCue"]'), globeLayerEl = stage.closest('.beat-globe-live') || stage;
  { const lh = stage.querySelector('.lpanel .lhead'); if (lh && voyageChangeBtn) lh.insertBefore(voyageChangeBtn, lh.querySelector('b')?.nextSibling || null); }   // 4 Oct 2026, Simon: "switch the positions of 'change ship' and 'scroll to continue'" — Change ship sits in the header under "Your voyage", the cue below the card (beat.html order)
  // 3 Oct 2026, Simon: "just include one at the top when the one under OR is no longer visible" — the original pulsing cue (the armed demo button
  // under "OR") is untouched. Once the finder has collapsed to the voyage card that button is gone, so this header cue takes over for the rest of
  // the voyage; it flashes once the visitor has stopped scrolling for a moment (the "when needed" part) and sits quietly while they're moving.
  let voyageLastScrollAt = performance.now();
  addEventListener('scroll', () => { voyageLastScrollAt = performance.now(); }, { passive: true });
  let voyageWasWanted = false, routeCueSeen = false, voyageGxShown = null;
  let voyageHold = false;      // a vessel is selected and its card is up: the globe stays centred on her instead of idle-spinning away
  let kinDismissed = false;    // "Change ship" / the X took the demo vessel away — she stays gone (even if the page is scrolled) until the demo is armed again
  let cueShownAt = 0, cueWasOn = false;
  voyageChangeBtn?.addEventListener('click', () => voyageReopenBtn?.click());   // same reset-and-reopen as the old "Change ship" pill
  voyageToggleBtn?.addEventListener('click', () => { const c = voyageSlot?.classList.toggle('compact'); voyageToggleBtn.setAttribute('aria-expanded', c ? 'false' : 'true'); });
  if (voyageSlot && window.matchMedia?.('(max-width:820px)').matches) { voyageSlot.classList.add('compact'); voyageToggleBtn?.setAttribute('aria-expanded', 'false'); }   // small screens start compact: the card would otherwise cover much of the globe
  // Simon, 17 Sep: once the deep-zoom fade takes the finder, there's no way to abort or change vessel without
  // scrolling all the way back up. Rather than keep the whole panel up throughout the deep zoom (undercutting the
  // reveal it's designed to give Kinship — see the "deep" fade below, ~line 1290), this stays a one-way switch: the
  // small .lreopen pill fades in as the panel fades out (tick(), same place), and forces the panel fully back
  // (opacity/pointer-events) for the rest of the scroll once clicked, rather than toggling on and off with scroll position.
  // 2nd pass, same day: "Follow this ship" (live.js) also hides the panel now, independent of scroll — stage gets a
  // 'following' class instead of a second forced-flag, since it's a simpler yes/no than voyagePanelForced needs to be.
  let voyagePanelForced = false;
  // 17 Sep 2026, Simon: "Change ship" used to just reopen the panel, leaving whatever was already selected/shown
  // untouched underneath it — the chevron kept pulsing and the callout stayed open behind the reopened finder.
  // Now it actually deselects first (closes the callout, drops the chevron — live.js's own clear/closeCallout via
  // its "Clear" button, same reuse pattern as voyagePanelClose below), THEN reopens the panel. Deliberately leaves
  // scroll/zoom exactly where it is — if the captain is already zoomed in enough to see other vessels' icons, they
  // can click one directly (that path already works); it's only the finder search and "Use example vessel" that
  // need the full zoom-out first, and each of those now resets it themselves, right when they're actually used.
  voyageReopenBtn?.addEventListener('click', () => {
    voyagePanelForced = true;
    stage.classList.remove('following');
    resetVoyageRoute();   // 17 Sep 2026: a route in progress is abandoned like any other selection, "Change ship" reopening the finder underneath it
    stage.querySelector('[data-live="clear"]')?.click();
    if (VOYAGE_CARD_IN_FINDER && !voyageMonitorMode) {   // 4 Oct 2026, Simon: if the demo ship is selected, "Change ship" deselects it completely (chevron, card, the lot) and starts over from the top with scroll held until the next ship is chosen
      resetVoyageExample(); kinDismissed = true;
      window.scrollTo(0, 0);   // unconditional: scrollY can lag a just-issued scroll (smooth scrolling), and overflow:hidden below would freeze it wherever it lands
      voyageScrollLocked = true; document.body.style.overflow = 'hidden';
    }
  });

  /* Voyage Planner — scroll-lock timing (17 Sep 2026, Simon's last note of the night): the CTA used to unlock
     scroll itself the moment it opened the finder. Now it only opens the finder — scroll (the globe stays fully
     draggable throughout, this is page scroll only) stays locked until the captain actually commits to a path:
     "Use example vessel instead" is the only unlock path right now. Picking a real ship no longer unlocks scroll on
     its own — "Take me in" (which used to) is gone as of the 2nd pass below, replaced by "Follow this ship", which
     is deliberately just a look/track action, not a commitment; Simon's moving the actual commit-and-sail trigger
     somewhere else next. voyage-gate (panel/key visibility) and the scroll lock (body.style.overflow) used to be
     the same switch; they're deliberately two separate ones now. */
  const voyageStartsLocked = !new URLSearchParams(location.search).has('goto');
  if (voyageStartsLocked) { stage.classList.add('voyage-gate'); document.body.style.overflow = 'hidden'; }
  let voyageScrollLocked = voyageStartsLocked;
  function voyageUnlockScroll() { voyageScrollLocked = false; document.body.style.overflow = ''; }
  voyageCtaBtn?.addEventListener('click', () => {
    stage.classList.remove('voyage-gate');   // reveals the finder — no longer touches the scroll lock
    voyageCta.hidden = true;
    stage.querySelector('[data-live="search"]')?.focus();
  });

  /* "Use example vessel instead" (17 Sep 2026, 4th+5th pass; chevron preview removed 6th pass — didn't work for
     Simon, dropped rather than debugged further) — the auto-zoom (driving scrollBy from our own rAF loop, then a
     probe-measured native scrollTo) never worked reliably for Simon across three attempts, so scrapped: back to
     just unlocking scroll, same as every other resolve path. The button itself is the prompt instead — swaps to
     "Scroll to continue your journey", goes solid orange/white (.armed, replicating the opening CTA) and pulses
     obviously (.pulse, that same CTA's own animation) until p passes 0.57 (tick(), below) — a progress cutoff
     rather than "stops on the first scroll input". */
  let voyageExampleArmed = false, voyageMonitorArmed = false, voyageMonitorMode = false;
  // 17 Sep 2026, Simon: the two resolve buttons are mutually exclusive — arming one resets the other back to its
  // unarmed label rather than letting both sit "armed" at once. Pulled the reset logic out to a function since it's
  // now needed in three places (each button resetting the other, plus the panel's own "X" below).
  function resetVoyageExample() {
    voyageExampleArmed = false;
    if (voyageExampleBtn) { voyageExampleBtn.disabled = false; voyageExampleBtn.textContent = VOYAGE_EXAMPLE_LABEL; voyageExampleBtn.classList.remove('armed', 'pulse'); }
    kinCardShown = null;   // her callout picks a sticky aft-quarter/amidships anchor (placeKinship/calloutQuarter) rather than a stateless scripted path — reset so a re-armed demo snaps to a fresh anchor instead of easing in from where it last was
  }
  function resetVoyageMonitor() {
    voyageMonitorArmed = false; voyageMonitorMode = false;
    if (voyageMonitorBtn) { voyageMonitorBtn.disabled = false; voyageMonitorBtn.textContent = VOYAGE_MONITOR_LABEL; voyageMonitorBtn.classList.remove('armed', 'pulse'); }
  }
  // Voyage Planner Phase 4 (17 Sep 2026) — a third mutually-exclusive mode: "Change Destination: Jersey" on a real
  // selected ship (live.js's renderCallout(), wired via the onChangeDestination callback further down) arms a
  // scripted route for her, same family as the other two. routeShip/routeAisCore/routeCalloutCard etc. are declared
  // with the routing engine further down in this same function scope — by the time this is ever actually CALLED
  // (a click handler, after mount() has finished its synchronous setup), they're already assigned.
  let voyageRouteMode = false;
  // 18 Sep 2026, Simon's first-pass feedback: a ship starting somewhere like the US East Coast could sit off-screen
  // for most of her own ocean-transit leg, since the camera/globe otherwise just runs its own idle-spin/reorientation
  // schedule regardless of where she is — voyageRouteFaceLL (her current lon/lat, set every frame in
  // placeVoyageRoute) plus routeFocusMix (a gradual ramp, same idea as live.js's own focusMix) drive tick() to keep
  // her roughly centred instead, fading back out as the match-cut (same endBlend window) takes over.
  let voyageRouteFaceLL = null, routeFocusMix = 0;
  function resetVoyageRoute() {
    if (!voyageRouteMode) return;
    voyageRouteMode = false;
    voyageRouteFaceLL = null; routeFocusMix = 0;
    if (routeShip) routeShip.mat.opacity = 0;
    if (routeAisCore) { routeAisCore.style.opacity = '0'; routeAisFlash.style.opacity = '0'; routeAisGlow.style.opacity = '0'; }
    if (routeCalloutCard) { routeCalloutCard.style.opacity = '0'; routeCalloutLine.style.opacity = '0'; }
    live?.setRouteMode?.(false);   // hand her rendering back to live.js (a no-op if nothing's selected any more)
  }
  // 17 Sep 2026, Simon: clicking either button again while it's the one currently armed now deselects — same full
  // "back to the start" reset as the panel's own X (voyagePanelClose, below), reused rather than duplicated. Used
  // to just stay disabled once clicked (a one-way label, not a re-clickable action) — no longer disabled, so it's
  // actually clickable a second time.
  voyageExampleBtn?.addEventListener('click', () => {
    if (voyageExampleArmed) { voyagePanelClose?.click(); return; }
    if (window.scrollY > 0) window.scrollTo(0, 0);   // if "Change ship" left scroll wherever it was (deliberately — see voyageReopenBtn above), the example flow needs to start from the full world view, not wherever the previous ship happened to leave the camera
    voyageUnlockScroll();
    resetVoyageMonitor(); resetVoyageRoute();
    voyageExampleBtn.textContent = 'Scroll to continue your journey';
    voyageExampleBtn.classList.add('armed');
    voyageExampleArmed = true;
    kinDismissed = false;
    live?.focusOn?.(KIN_ORIGIN.lng, KIN_ORIGIN.lat);   // 4 Oct 2026, Simon: the globe centres on the demo vessel on the first click, not on the first scroll
  });
  // "Observe the Channel Islands" (17 Sep 2026, Simon; relabelled from "Channel Islands Monitor" same day) — a
  // second way to unlock scroll, same deep-zoom views as "Bring in a demo vessel" above, just genuinely without
  // Kinship in it: voyageMonitorMode suppresses her scripted marker/callout entirely (placeKinship(), below) rather
  // than just leaving her unmentioned in the copy.
  voyageMonitorBtn?.addEventListener('click', () => {
    if (voyageMonitorArmed) { voyagePanelClose?.click(); return; }
    if (window.scrollY > 0) window.scrollTo(0, 0);
    voyageUnlockScroll();
    resetVoyageExample(); resetVoyageRoute();
    voyageMonitorMode = true;
    voyageMonitorBtn.textContent = 'Scroll to view live traffic';
    voyageMonitorBtn.classList.add('armed');
    voyageMonitorArmed = true;
  });
  // 18 Sep 2026, Simon: the AIS Live / CI Flights labels (live.js's #aisControl — both the AIS word and flights.js's
  // own word appended into the same control wear .lmode) are now clickable shortcuts straight into observe mode —
  // arms the same state "Observe the Channel Islands" does, then jumps to this beat's own p=0.80 (well into the
  // satellite view, fleet already on screen) instead of leaving them to scroll there. This beat is a member of a
  // pinned layer group (beat-layer), so its own <section>'s offsetTop/offsetHeight is just the shared viewport-sized
  // pinned area, not the real scroll track — using it gave a jump of 0px. Same fix as "Jump to the approaches"
  // below: real vh math off the CURRENT progress instead of an absolute DOM position (GLOBE_LIVE_VH, defined further
  // down but already assigned by the time this ever actually runs, since it's only ever called from a later click).
  function jumpToObserve() {
    return;   // 4 Nov 2026, Simon: "Observe the Channel Islands" is gone with the live traffic it was for (the words in the strip no longer jump there)
    if (voyageMonitorArmed) return;   // already there — nothing to do
    resetVoyageExample(); resetVoyageRoute();
    stage.classList.remove('voyage-gate'); voyageCta.hidden = true;
    voyageUnlockScroll();
    voyageMonitorMode = true;
    if (voyageMonitorBtn) { voyageMonitorBtn.disabled = false; voyageMonitorBtn.textContent = 'Scroll to view live traffic'; voyageMonitorBtn.classList.add('armed'); }
    voyageMonitorArmed = true;
    const curP = scrollProgress();
    const jumpPx = (0.80 - curP) * GLOBE_LIVE_VH * (window.innerHeight / 100);
    if (jumpPx > 0) window.scrollTo(0, window.scrollY + jumpPx);
  }
  // 17 Sep 2026, Simon: "Jump to the approaches" (below) should nudge the captain if they land in seaway-wake and
  // then just... stop. This hint has to survive the jump into a DIFFERENT beat's own pinned section, so — same
  // reasoning as live.js's #aisControl — it's created once and appended straight to document.body, outside this
  // (or any) beat's own stage container, rather than declared in beat.html: .beat-stage has overflow:hidden +
  // contain:paint, which would clip a position:fixed descendant to this beat's own bounds instead of the viewport,
  // defeating the entire point once scrolled away from it.
  let scrollHintEl = null, scrollHintTimer = null, scrollHintScrollHandler = null, scrollHintSettleTimer = null;
  function ensureScrollHint() {
    if (scrollHintEl) return scrollHintEl;
    if (!document.getElementById('voyageScrollHintStyle')) {
      const css = document.createElement('style'); css.id = 'voyageScrollHintStyle';
      css.textContent = '.voyage-scroll-hint{position:fixed;left:50%;bottom:6vh;transform:translateX(-50%);z-index:9997;' +
        'opacity:0;pointer-events:none;transition:opacity .3s;background:rgba(6,10,18,.82);color:#fff;' +
        'border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:10px 22px;font:500 12px "Jost",sans-serif;' +
        'letter-spacing:.1em;text-transform:uppercase;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
        '.voyage-scroll-hint.flash{opacity:1;animation:voyageScrollHintFlash 1.4s ease-in-out infinite}' +
        '@keyframes voyageScrollHintFlash{0%,100%{opacity:1}50%{opacity:.35}}';
      document.head.appendChild(css);
    }
    scrollHintEl = document.createElement('div'); scrollHintEl.className = 'voyage-scroll-hint'; scrollHintEl.textContent = 'Scroll to continue';
    document.body.appendChild(scrollHintEl);
    return scrollHintEl;
  }
  function armScrollHint() {
    // note: no inline opacity here — .flash (CSS, above) is the only thing that should ever set opacity:1, so
    // nothing here can end up overriding it the way an inline style would
    const el = ensureScrollHint();
    clearTimeout(scrollHintTimer);
    el.classList.remove('flash');
    if (scrollHintScrollHandler) { window.removeEventListener('scroll', scrollHintScrollHandler); scrollHintScrollHandler = null; }
    // 17 Sep 2026: the jump's OWN scrollTo() doesn't settle synchronously (found testing: still ~1000px short of
    // its ~7500px destination a full 150ms after the call), so capturing startY on any FIXED short delay risks
    // grabbing an in-transit value — the jump's own continued settling then reads as "the captain already
    // scrolled" and cancels the timer before it ever really started. Polls scrollY instead: only once it reports
    // the SAME value on two checks in a row (genuinely at rest, not just mid-jump) does the real 3s countdown begin.
    let lastY = window.scrollY, settleChecks = 0;
    clearInterval(scrollHintSettleTimer);
    scrollHintSettleTimer = setInterval(() => {
      const y = window.scrollY;
      settleChecks = (y === lastY) ? settleChecks + 1 : 0;
      lastY = y;
      if (settleChecks < 2) return;
      clearInterval(scrollHintSettleTimer);
      const startY = y;
      scrollHintTimer = setTimeout(() => { if (window.scrollY === startY) el.classList.add('flash'); }, 3000);
      scrollHintScrollHandler = () => {
        if (window.scrollY === startY) return;
        clearTimeout(scrollHintTimer); el.classList.remove('flash');
        window.removeEventListener('scroll', scrollHintScrollHandler); scrollHintScrollHandler = null;
      };
      window.addEventListener('scroll', scrollHintScrollHandler, { passive: true });
    }, 120);
  }
  // "Jump to the approaches" (17 Sep 2026, Simon; relabelled from "Enter the approaches" same day) — a way to carry
  // on toward the port without picking a vessel: jumps straight to seaway-wake's own p=0, not just somewhere past
  // globe-live's own end (that landed partway into cloud-pass, the beat in between — Simon wanted seaway-wake
  // itself). First attempt reused the monitor cap's local p-vs-scrollY slope (capPxPerP) extrapolated past p=1 —
  // wrong, because the runtime clamps a group member's own p to [0,1] (stage.js progressOf()), so the moment the
  // jump crosses into the next beat's own range, capPxPerP's next sample gets poisoned (p reads a flat 1 while
  // scrollY keeps climbing) and any further correction is working off a corrupted slope. Switched to real vh math
  // instead — stage.js computes every beat's pixel length as `parseFloat(track)/100 * window.innerHeight`
  // (its own toPx()/vh() helpers), so the SAME conversion here isn't inferred from anything, it's exact. index.html
  // is still the one place that could drift from these two track heights (globe-live 560vh, cloud-pass 260vh).
  const GLOBE_LIVE_VH = 560, CLOUD_PASS_VH = 260;
  voyageEnterBtn?.addEventListener('click', () => {
    const curP = scrollProgress();
    resetVoyageMonitor();
    const jumpPx = (GLOBE_LIVE_VH * (1 - curP) + CLOUD_PASS_VH) * (window.innerHeight / 100);
    window.scrollTo(0, Math.max(0, window.scrollY + jumpPx));
    armScrollHint();
  });

  // the picker's own "X" — backs all the way out to the opening CTA and re-locks everything (16 Sep 2026)
  voyagePanelClose?.addEventListener('click', () => {
    voyagePanelForced = false;
    stage.classList.remove('following');
    resetVoyageExample(); resetVoyageMonitor(); resetVoyageRoute();   // fresh start if they come back through the CTA again
    kinDismissed = true;
    stage.querySelector('[data-live="clear"]')?.click();   // drop any selected ship (live.js's own reset)
    const search = stage.querySelector('[data-live="search"]'); if (search) search.value = '';
    stage.querySelector('[data-live="panel"]')?.classList.remove('expanded');
    window.scrollTo(0, 0);   // jump before the lock, not after — overflow:hidden freezes wherever scrollY already is
    voyageScrollLocked = true;
    stage.classList.add('voyage-gate');
    stage.classList.add('globe-intro');   // 4 Oct 2026, Simon: the finder's X goes all the way back to the first view — finder closed, "Start your voyage" + "Skip to CIPS" showing (globe-intro is globe-enhancements.js's own intro state: it hides the panel and shows the CTA row; its Start button clears it again)
    document.body.style.overflow = 'hidden';
    voyageCta.hidden = false;
  });
  // Kinship's own example-vessel callout gets the same "X" (17 Sep 2026, Simon) — same cancel-and-restart as the
  // live one. Her card's own visibility is purely scroll-position-driven (placeKinship(), no on/off flag of its
  // own), so voyagePanelClose's scrollTo(0,0) is enough on its own to take her off screen and settle the globe back
  // to its resting view — no extra recentre step needed here the way the live callout's X needed one.
  stage.querySelector('[data-g="kinCalloutClose"]')?.addEventListener('click', () => voyagePanelClose?.click());

  // if a captain scrolls (wheel/keyboard) before resolving a path, pulse whatever's actually in front of them rather
  // than just silently eating the scroll — 18 Sep 2026, Simon: extended to a second phase. Before "Choose your ship
  // and start your voyage" is clicked, that's the CTA itself (unchanged). Once it's open but neither "Bring in a
  // demo vessel" nor "Observe the Channel Islands" has been picked yet, the CTA is gone (hidden) — pulse the finder
  // panel's own outline plus both buttons instead, alternating toward their own :hover look (orange outline, not a
  // solid fill — they're not armed yet) rather than reusing the CTA's solid-orange animation, which would misread
  // as "already chosen". Both buttons call voyageUnlockScroll() the instant either is clicked, so voyageScrollLocked
  // itself already gates this to exactly the window before a path is picked — no extra armed-state check needed.
  let voyagePulseAt = 0;
  function voyagePulse() {
    if (!voyageScrollLocked) return;
    const now = performance.now(); if (now - voyagePulseAt < 2200) return; voyagePulseAt = now;   // >= the 2×1s nudge (voyageNudge, js/globe-enhancements.js), so a repeat attempt restarts cleanly rather than cutting in
    if (!voyageCta.hidden && !stage.classList.contains('vessel-picked')) {   // the hero button only nudges while no vessel is chosen (4 Oct 2026, Simon)
      voyageCtaBtn.classList.remove('pulse'); void voyageCtaBtn.offsetWidth; voyageCtaBtn.classList.add('pulse');
      return;
    }
    const simBtn = stage.classList.contains('vessel-picked') ? voyageSlot?.querySelector('.ltake') : null;   // a live ship is chosen but her route isn't started: the next thing to press is "Simulate route to Jersey"
    if (simBtn) { simBtn.classList.remove('gate-pulse'); void simBtn.offsetWidth; simBtn.classList.add('gate-pulse'); return; }
    if (voyageFinderPanel) { voyageFinderPanel.classList.remove('gate-pulse'); void voyageFinderPanel.offsetWidth; voyageFinderPanel.classList.add('gate-pulse'); }
    [voyageExampleBtn, voyageMonitorBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('gate-pulse'); void btn.offsetWidth; btn.classList.add('gate-pulse');
    });
  }
  window.addEventListener('wheel', voyagePulse, { passive: true });
  window.addEventListener('keydown', e => { if (['ArrowDown', 'PageDown', 'End', ' '].includes(e.key)) voyagePulse(); });
  // 17 Sep 2026, Simon: once scroll is capped at MONITOR_CAP under "Observe the Channel Islands", a further
  // scroll-down attempt is a HARD lock — preventDefault() on the wheel/key event itself stops the scroll from ever
  // being applied once already at the cap, rather than correcting it after the fact (the per-frame corrective
  // scrollTo() in tick() could be outrun by sustained scrolling — each correction is only as good as the previous
  // frame's local p-vs-scrollY slope, so a fast enough scroll could creep past it a little every frame). Scrolling
  // back UP is untouched (only deltaY>0 / the "further in" keys are blocked); the per-frame correction in tick()
  // stays too, as a fallback for whatever doesn't arrive as a plain wheel/keydown (e.g. a dragged scrollbar).
  function voyageMonitorAtCap() { return voyageMonitorMode && scrollProgress() >= MONITOR_CAP - 0.005; }
  // 18 Sep 2026, Simon: first tried the reopen pills solid orange all the time she's at the cap, then solid orange
  // plus a brighter pulse per attempt — both read as too static/heavy. Now matches the ship-finder's own gate hint
  // exactly: pills stay in their normal dark look at rest, and each actual attempt to scroll past the cap pulses
  // just the text/outline orange with a glow (same throttling pattern as voyagePulse above).
  let voyageCapPulseAt = 0;
  function voyageCapPulse() {
    const now = performance.now(); if (now - voyageCapPulseAt < 2800) return; voyageCapPulseAt = now;
    [voyageReopenBtn, voyageEnterBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('gate-pulse'); void btn.offsetWidth; btn.classList.add('gate-pulse');
    });
  }
  window.addEventListener('wheel', e => { if (e.deltaY > 0 && voyageMonitorAtCap()) { e.preventDefault(); voyageCapPulse(); } }, { passive: false });
  window.addEventListener('keydown', e => { if (['ArrowDown', 'PageDown', 'End', ' '].includes(e.key) && voyageMonitorAtCap()) { e.preventDefault(); voyageCapPulse(); } });

  /* ---------- three.js scene ---------- */
  const host = stage.querySelector('[data-g="globe"]');
  const W = host.clientWidth, H = host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  host.appendChild(labelRenderer.domElement);
  
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fov, W / H, 0.1, 100);
  camera.position.set(0, 0, CFG.cameraZ);
  
  // scroll-driven camera + globe orientation (no OrbitControls in this build)
  const BASE_X = 0.12;                 // slight cosmetic tilt
  /* Simon, 17 Sep 2026: scrolling from p=0 wasn't doing much — the old order was idle spin (time-based, not
     scroll-driven) for the first ~28%, a static hold to ~33%, THEN zoom, with the settle-to-CI-facing slerp
     overlapping the zoom (0.38-0.66) rather than finishing before it starts. Reordered: reorientation first
     (scroll-driven from p=0, not time-based), completing at REORIENT_END, THEN zoom begins — and REORIENT_END
     itself scales with how much turning the settle actually has to do (computed below, once startQuat/ciFacingQuat
     exist), so little reorientation needed means almost straight into the zoom, more needed means more scroll
     before it starts. Idle spin (SPIN_RATE/spinY) is back per Simon's follow-up — it's just gated to p<=0 now
     (below), so it only runs while genuinely at rest and freezes the instant scrolling starts, instead of fading
     out over the first ~28% of scroll the way it used to; the reorientation slerp then picks up smoothly from
     wherever the idle spin left off, same REORIENT_END window either way. */
  const SPIN_RATE = 0.00035;           // rad/frame idle spin, while sitting at the very top, unscrolled (paused while dragging too)
  let spinY = 0;
  const REORIENT_MIN = 0.04, REORIENT_MAX = 0.30, REORIENT_SCALE = Math.PI / 2;   // p-window bounds, and the angle (90°) treated as "a lot" for the mapping
  let REORIENT_END = 0.18;   // fallback until recomputed after computeCIFacing() below
  const YAXIS = new THREE.Vector3(0, 1, 0), XAXIS = new THREE.Vector3(1, 0, 0);
  const START = { lat: 49.45, lng: -2.5 };       // *** STARTING VIEW: point that faces you at load *** (the Channel Islands, upper-left — no Africa reveal)
  const CI_CENTER = { lat: 49.45, lng: -2.5 };   // frame the whole archipelago on approach
  const FAR_Z = 2.35, NEAR_Z = 1.16;             // FAR = world-view size (smaller = bigger globe); NEAR keeps London in frame
  const CLOSE_DEPTH = 0.0062;                    // HLC lab: the deep zoom ends this far above the surface (≈ the night map's 42 m/px at Jersey)
  let jerseyQuat = null;                         // the deep zoom settles Jersey to the centre, north up
  const startQuat = new THREE.Quaternion();
  const ciFacingQuat = new THREE.Quaternion();   // both computed once lonLatToVec3 is available
  const CI_OFFSET = Math.PI / 11;                // rotate CI down and toward center (right, lower) — kept small so the fly-in doesn't twist
  const START_OFFSET = -Math.PI / 14;            // rotate CI up-left (2/3 up, near the left edge) for the load frame — small, same direction logic as CI_OFFSET so the roll barely changes en route
  function computeStart(){
    startQuat.setFromUnitVectors(lonLatToVec3(START.lng, START.lat, 1).normalize(), new THREE.Vector3(0, 0, 1));
    const offsetQ = new THREE.Quaternion();
    offsetQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), START_OFFSET);
    startQuat.multiplyQuaternions(offsetQ, startQuat);
  }
  function computeCIFacing(){
    ciFacingQuat.setFromUnitVectors(lonLatToVec3(CI_CENTER.lng, CI_CENTER.lat, 1).normalize(), new THREE.Vector3(0, 0, 1));
    // apply z-axis offset to move CI to 10 o'clock position
    const offsetQ = new THREE.Quaternion();
    offsetQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), CI_OFFSET);
    ciFacingQuat.multiplyQuaternions(offsetQ, ciFacingQuat);
    if (o.northUp) {
      // roll so that, at the archipelago, north points straight up the screen (the camera sits on +z, so screen ≈ x,y)
      const a = lonLatToVec3(CI_CENTER.lng, CI_CENTER.lat, 1).applyQuaternion(ciFacingQuat);
      const b = lonLatToVec3(CI_CENTER.lng, CI_CENTER.lat + 0.5, 1).applyQuaternion(ciFacingQuat);
      const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - Math.atan2(b.y - a.y, b.x - a.x));
      ciFacingQuat.multiplyQuaternions(fix, ciFacingQuat);
    }
  }
  // generic: the quaternion that brings (lng,lat) to face the camera with north straight up (used by the live picker)
  function faceQuat(lng, lat){
    const q = new THREE.Quaternion().setFromUnitVectors(lonLatToVec3(lng, lat, 1).normalize(), new THREE.Vector3(0, 0, 1));
    const a = lonLatToVec3(lng, lat, 1).applyQuaternion(q), b = lonLatToVec3(lng, lat + 0.5, 1).applyQuaternion(q);
    const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - Math.atan2(b.y - a.y, b.x - a.x));
    return fix.multiply(q);
  }
  let live = null;
  /* HLC lab: the approach — as we fly in, the coarse dot matrix gives way to a drawn coastline of the Channel (the same
     coast the night map uses), so the last frame of the globe is an outline that the map then fills in. */
  let fillFade = null, edgeFade = null, coastLines = null, coastMat = null, nightMesh = null, nightMat = null;
  /* the night aerial ON the sphere: the Channel region as a Web-Mercator tile mosaic (the same imagery + Black Marble lights
     recipe channel-night uses), draped on a sphere patch whose UVs are Mercator, so the picture the globe holds at its last
     frame is the picture the night map opens on — the crossfade between them has nothing to hide. */
  /* go-live (4 Nov 2026, Simon): the map tiles are baked into assets/tiles (Esri World Imagery z7 over the Channel and z9 over the islands, NASA VIIRS Black Marble z7/z8, exactly the tiles the mosaic below asks for) so the page asks no outside server for them. */
  const TILE_BASE = new URL('assets/tiles/', import.meta.url).href;
  const NIGHT = { z: 7, lonMin: -8.5, lonMax: 5.5, latMin: 46.8, latMax: 53.2, tint: 0.74,
    imagery: TILE_BASE + 'esri/{z}/{y}/{x}.jpg',
    lights: TILE_BASE + 'nasa/{z}/{y}/{x}.png' };
  const patches = [];   // { mesh, mat, in:[p0,p1] } — the tile pyramid on the sphere: z7 (Channel) → z9 (islands region) → the HD plate
  function mercUV() { const D2R = Math.PI / 180; return { tx: (lon, n) => (lon + 180) / 360 * n, ty: (lat, n) => (1 - Math.log(Math.tan(lat * D2R) + 1 / Math.cos(lat * D2R)) / Math.PI) / 2 * n }; }
  function patchGeometry(lonA, lonB, latA, latB, uvOf, radius, W = 96, H = 64) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) { const lon = lonA + (lonB - lonA) * i / W, lat = latA + (latB - latA) * j / H; const v = lonLatToVec3(lon, lat, radius); pos.push(v.x, v.y, v.z); const q = uvOf(lon, lat); uv.push(q[0], q[1]); }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const a = j * (W + 1) + i, b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); return geo;
  }
  let featherTex = null;
  function feather(edge = 0.16) {   // a soft-edged rectangle: opaque inside, fading to nothing over `edge` of each side
    if (featherTex) return featherTex; const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'); const d = c.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const fx = Math.min(x, N - 1 - x) / (N * edge), fy = Math.min(y, N - 1 - y) / (N * edge); const a = Math.min(1, fx) * Math.min(1, fy); const o = (y * N + x) * 4; d.data[o] = d.data[o + 1] = d.data[o + 2] = Math.round(255 * a * a * (3 - 2 * a)); d.data[o + 3] = 255; }
    c.putImageData(d, 0, 0); featherTex = new THREE.CanvasTexture(cv); return featherTex;
  }
  function addPatch(tex, geo, order, radiusUnused, fadeIn) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: feather(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });   // DoubleSide: the lon/lat grid winds clockwise seen from outside
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = order; globe.add(mesh); patches.push({ mesh, mat, in: fadeIn }); return mat;
  }
  // the HD night plate (channel-night's own, 32 m/px, Mercator bounds) draped on the islands — the sharpest layer, last to arrive
  async function buildPlate() {
    try {
      const base = new URL('../channel-night/', import.meta.url).href;
      const meta = await (await fetch(base + 'assets/plate-islands.json', { cache: 'force-cache' })).json(); const b = meta.bounds;
      const tex = await new Promise((res, rej) => new THREE.TextureLoader().load(base + 'assets/' + meta.file, res, undefined, rej));
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8; if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      const { tx, ty } = mercUV(), n = 1; const u0 = tx(b.west, n), u1 = tx(b.east, n), v0 = ty(b.north, n), v1 = ty(b.south, n);
      const geo = patchGeometry(b.west, b.east, b.south, b.north, (lon, lat) => [(tx(lon, n) - u0) / (u1 - u0), 1 - (ty(lat, n) - v0) / (v1 - v0)], CFG.radius * 1.0017, 64, 64);
      addPatch(tex, geo, -1, 0, [0.80, 0.90]);
      console.log('[globe-live] HD plate on the sphere', meta.width + '×' + meta.height);
    } catch (e) { console.warn('[globe-live] plate unavailable', e); }
  }
  /* Kinship — channel-night's plan-view sprite on the sphere, on its Biscay → Brest → Ushant → western-approach track:
     a speck far to the west as the aerial arrives, growing as we come down, off Jersey's west coast by the end. */
  let kin = null;   // { mesh, mat, pts:[Vector3 unit], cum:[], total }
  const KIN_TRACK = [[45.35, -4.85], [47.10, -5.35], [48.00, -5.40], [48.85, -4.75], [49.02, -3.55], [49.08, -3.05], [49.13, -2.62], [49.158, -2.36], [49.168, -2.24]];   // lat, lng (channel-night)
  const KIN = { show: [0.02, 1.0], px: [10, 102], lift: 1.0026, endScreen: { x: 0.283, y: 0.515 }, endBearing: 90, endBlend: [0.74, 1.0] };   // ends south-west of Corbière, heading due east (was 96 — Howard's lab, 15 Sep) to pass south of the lighthouse; ≈100 px ≈ the clouds-beat size   // endScreen/endBlend: by the end she sits centre-left, mid-height, bow east, ≈170 px, and stays there under the clouds (the globe layer holds its last frame until cloud-pass has covered it)   // endScreen.x nudged 0.255→0.283, 24 Sep 2026, Simon: "advancing a little more before stopping, so it comes to rest with the stern aligned with the left edge of the text below it" (globeCopy2) — calibrated via a temporary debug hook reading her actual projected sp.x/px at rest against two test values (0.20, 0.30), fit linearly against globeCopy2's live left edge, same recipe as every other waypoint in this file
  // 23 Sep 2026, Simon: "start the demo voyage earlier, departing from Monaco, visible while still on the wide
  // dot-matrix view, moving in as we zoom — like an actual ship found via the ship finder in Monaco." That
  // comparison is literal, not just a figure of speech: Phase 4's own planVoyageRoute()/SHIP_LANES network
  // (below) already does exactly this for a real selected ship, including a Western Mediterranean lane added
  // specifically for a Monaco-area test ship — so Kinship's demo track now uses that same proven routing engine,
  // seeded with a fixed origin instead of a live AIS position, rather than a hand-extended KIN_TRACK. show[0]
  // above was 0.56 (only appeared once the camera had nearly finished zooming in) — now 0.02, matching
  // VOYAGE_ROUTE's own already-shipped early-visibility window (see VOYAGE_ROUTE_MERGE_P/planVoyageRoute below).
  // kin.pts / KIN_TRACK / the endScreen/endBearing/endBlend numbers above are all untouched: planVoyageRoute()
  // always merges its tail onto kin.pts.slice(VOYAGE_ROUTE_MERGE_INDEX), so her ending is identical to today.
  const KIN_ORIGIN = { lat: 43.7384, lng: 7.4246 };   // Monaco
  let kinWasPing = false, kinGrowFrom = null;   // the ping that shows while the picker is open, and when it began growing into the full chevron
  const kinPingWave = () => KIN_AIS.pulseFloor + (1 - KIN_AIS.pulseFloor) * (0.5 + 0.5 * Math.cos(performance.now() / 1000 * Math.PI * 2 / 1.5));   // a steady 1.5 s rhythm, in time (the scrolling pulse below runs on distance)
  let kinFaceLL = null, kinFocusMix = 0;   // 4 Nov 2026: where the demo vessel is right now (set every frame in placeKinship) and how firmly the globe is following her (tick)
  let kinRoute = null;   // { pts, cum, total, tailStart } from planVoyageRoute() — set once buildKinship()'s curve (kin.pts) exists, since planVoyageRoute() depends on it for its tail
  // 23 Sep 2026, Simon: widening KIN.show (above) to make her visible early accidentally also dragged the chevron-
  // >sprite crossfade and her pixel-size growth earlier too, for BOTH scripted ships — placeVoyageRoute's own uK
  // reads KIN.show directly, so this affected real routed ships as well, not just the demo. That crossfade/size
  // schedule needs to stay on the original narrow, late window regardless of how early she's now visible — a ship
  // that's still a speck near Monaco shouldn't already be growing into her full plan-view sprite. Kept as its own
  // constant (not reusing KIN.show) precisely so the visibility window can keep changing independently of this.
  const KIN_SPRITE_SCHEDULE = [0.56, 1.0];

  /* KINSHIP AIS MARKER + CALLOUT — TRIAL (15 Sep 2026), ported from channel-night's version (u stands in for ys — her
     own progress, 0..1 — throughout, exactly like channel-night's ys). Same tuned numbers as channel-night's final
     pass today. No directional chevron: a plain pulsing disc instead, since giving it a heading needs a second
     screen-space projection (position + a point slightly ahead on the curve) that wasn't worth the complexity for a
     first pass — easy to add later. The callout's position is a single fixed spot (see .kin-callout-card in
     beat.css) rather than a scripted path, since there's no live render to calibrate a path against yet like there
     was for channel-night — expect this needs the same kind of feedback round once Simon can see it scroll. */
  const KIN_AIS = { px: [10, 20], pulseDur: 0.05, pulsePeriod: 0.055, pulseFloor: 0.42, crossfade: [0.55, 0.72] };
  const KIN_CALLOUT_ENABLED = true;   // set false to switch off the marker/callout without touching anything else
  /* CALLOUT (23 Sep 2026: now trails behind her along her live heading — see placeKinship — rather than a scripted
     screen-space path; the old path was 5 waypoints hand-calibrated from Simon's marked screenshots for her old
     short Biscay track and can't generalise to the much longer Monaco route). Her branded content is unchanged. */
  const KIN_CALLOUT = { in: [0, 0.24], fadeOut: [0.97, 1.0],
    content: { title: 'M/Y KINSHIP', speedKts: 14, destination: { lat: 49.1869, lng: -2.1045 },   // St Helier
               rows: [['Destination', 'St Helier, Jersey'], ['For', 'Bunkers · Provisions · Crew change'], ['Speed', '14 kts'], ['ETA', '']] } };   // ETA filled in live in placeKinship(), matched by label

  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (t, attrs) => { const e = document.createElementNS(SVGNS, t); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  // host/stage's on-screen rects, cached and refreshed only on __resize() (below) — NOT read fresh every frame.
  // getBoundingClientRect() forces a synchronous layout pass, and calling it every frame right after other code in
  // tick() mutates styles (opacity etc.) was layout-thrashing — Simon, 15 Sep: "vessel movement... less smooth"
  let kinHostR = host.getBoundingClientRect(), kinStageR = stage.getBoundingClientRect();
  // any 3D world position -> plain stage pixels, using the same projection three.js/CSS2DRenderer would — for
  // positioning the (plain HTML/SVG, not CSS2DObject) AIS marker and the callout's leader line every frame
  function worldToStagePx(vec3) {
    const v = vec3.clone().project(camera);
    return { x: (v.x * 0.5 + 0.5) * kinHostR.width + (kinHostR.left - kinStageR.left), y: (1 - (v.y * 0.5 + 0.5)) * kinHostR.height + (kinHostR.top - kinStageR.top) };
  }
  function kinHaversineNm(a, b) {
    const R = 3440.065, rad = d => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  // both skip the DOM write once the text is already showing what it should — Simon, 15 Sep: these were rewriting
  // innerHTML/textContent every single frame even once fully typed, for the rest of the scroll
  const kinTypeText = (el, s, t) => { const v = s.slice(0, Math.round(s.length * Math.max(0, Math.min(1, t)))); if (el.textContent !== v) el.textContent = v; };
  const kinTypeRow = (el, label, value, t) => {   // colon is CSS (.k::after), same hanging-indent trick as channel-night
    const tt = Math.max(0, Math.min(1, t)), total = label.length + value.length, n = Math.round(total * tt);
    const la = Math.min(label.length, n), va = Math.max(0, n - label.length);
    const html = `<span class="k">${label.slice(0, la)}</span><span class="v">${value.slice(0, va)}</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  };
  const kinFxSvg = stage.querySelector('[data-g="kinfx"]');
  const kinCalloutCard = stage.querySelector('[data-g="kinCallout"]'), kinCalloutTitle = stage.querySelector('[data-g="kinCalloutTitle"]');
  const kinCalloutRows = [0, 1, 2, 3].map(i => stage.querySelector('[data-g="kinCalloutRow' + i + '"]'));
  const kinCalloutDist = stage.querySelector('[data-g="kinCalloutDist"]');
  if (VOYAGE_CARD_IN_FINDER && voyageSlot && kinCalloutCard) voyageSlot.appendChild(kinCalloutCard);
  const KIN_AIS_D = 'M7,0 L-5,-4 L-2,0 L-5,4 Z';   // a chevron, tip = bow — same shape channel-night uses, 0deg points +x (east/right)
  let kinAisCore = null, kinAisFlash = null, kinAisGlow = null, kinCalloutLine = null, kinCardSize = null;
  let kinCardShown = null;   // her callout's current/target sticky aft-quarter/amidships anchor (see calloutQuarter/placeKinship below), same idea as Phase 4's routeCardShown
  if (kinFxSvg) {
    const defs = svgEl('defs', {}); defs.innerHTML = '<radialGradient id="kin-comet"><stop offset="0" stop-color="#fff0dc" stop-opacity="1"/><stop offset=".35" stop-color="#FF8A1E" stop-opacity=".9"/><stop offset="1" stop-color="#FF8A1E" stop-opacity="0"/></radialGradient>';
    kinAisGlow = svgEl('circle', { class: 'kin-ais-glow', r: '9', fill: 'url(#kin-comet)' });
    kinAisCore = svgEl('path', { class: 'kin-ais-core', d: KIN_AIS_D, fill: '#C9D6E4', stroke: 'rgba(4,7,14,.55)', 'stroke-width': '0.6' });
    kinAisFlash = svgEl('path', { class: 'kin-ais-flash', d: KIN_AIS_D, fill: '#FF7A12' });
    kinCalloutLine = svgEl('path', { class: 'kin-callout-line', fill: 'none' });
    kinFxSvg.appendChild(defs); kinFxSvg.appendChild(kinAisGlow); kinFxSvg.appendChild(kinAisCore); kinFxSvg.appendChild(kinAisFlash); kinFxSvg.appendChild(kinCalloutLine);
  }

  async function buildKinship() {
    try {
      const tex = await new Promise((res, rej) => new THREE.TextureLoader().load(new URL('../channel-night/assets/ship-plan.png', import.meta.url).href, res, undefined, rej));
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const ar = tex.image.height / tex.image.width;   // the plan is drawn bow to the RIGHT (+x): width = length, height = beam (channel-night rotates it by course angle, 0 = east)
      const geo = new THREE.PlaneGeometry(1, ar); const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 6; mesh.frustumCulled = false; globe.add(mesh);
      // the track as a smooth curve on the sphere
      const raw = KIN_TRACK.map(([la, lo]) => lonLatToVec3(lo, la, 1).normalize()); const curve = new THREE.CatmullRomCurve3(raw, false, 'centripetal', 0.5);
      const pts = curve.getPoints(400).map(v => v.normalize());
      kin = { mesh, mat, pts, ar };
      // planVoyageRoute() (defined further down, needs kin.pts for its tail) is a plain function declaration,
      // hoisted within this same scope — safe to call here even though its definition appears later in the file.
      syncVesselFields();   // the visitor's departure and vessel name (js/vessel.js), if they have already chosen
      try { kinRoute = planVoyageRoute(KIN_ORIGIN.lat, KIN_ORIGIN.lng); publishKinRoute(); } catch (e) { console.warn('[globe-live] route from the departure unavailable, falling back to her own track', e); }
    } catch (e) { console.warn('[globe-live] Kinship sprite unavailable', e); }
  }
  // 4 Nov 2026, Simon: the visitor chooses where they are sailing from (js/vessel.js: Mediterranean = Monaco, Northern Europe = Rotterdam, Caribbean = St Maarten)
  // and may name the vessel (Kinship if not). The demo vessel's start, its route (the same lane planner the real-ship routes use) and the title on
  // its card follow that choice; with no choice it is exactly Kinship from Monaco as before.
  let vesselDep = null;
  function syncVesselFields() {
    const v = window.CIPS_VESSEL; if (!v || !v.dep) return false;
    KIN_ORIGIN.lat = v.dep.lat; KIN_ORIGIN.lng = v.dep.lng; KIN_ORIGIN.name = v.dep.place; KIN_CALLOUT.content.title = v.title;
    const changed = vesselDep !== v.departure; vesselDep = v.departure; return changed;
  }
  // 4 Nov 2026, Simon: the picker shows a preview of the journey card before "Start the journey" (globe-enhancements.js, arrangeDeparture). The numbers
  // come from the route planned here, so the preview, the voyage card and the vessel's actual passage always agree: published on window.CIPS_VESSEL.route
  // and announced as 'cips:route'.
  const kinFmtNm = nm => (Math.round(nm / 10) * 10).toLocaleString('en-GB') + ' nm';
  function kinFmtEta(h) {
    if (h >= 48) { let d = Math.floor(h / 24), r = Math.round(h - d * 24); if (r === 24) { d++; r = 0; } return d + ' days' + (r ? ' ' + r + ' hrs' : ''); }
    return h >= 1.5 ? Math.round(h) + ' hrs' : Math.max(1, Math.round(h * 60)) + ' mins';
  }
  function publishKinRoute() {
    const v = window.CIPS_VESSEL; if (!v || !kinRoute) return;
    const kts = KIN_CALLOUT.content.speedKts, eta = kinFmtEta(kinRoute.total / kts);
    v.route = { departure: v.departure, from: KIN_ORIGIN.name, nm: kinRoute.total, nmText: kinFmtNm(kinRoute.total), etaText: eta, rows: KIN_CALLOUT.content.rows.map(r => r[0] === 'ETA' ? ['ETA', eta] : r) };
    try { window.dispatchEvent(new CustomEvent('cips:route', { detail: v.route })); } catch (_) {}
  }
  window.addEventListener('cips:vessel', e => {
    const changed = syncVesselFields();
    if (changed && kin) { try { kinRoute = planVoyageRoute(KIN_ORIGIN.lat, KIN_ORIGIN.lng); publishKinRoute(); console.log('[globe-live] departure', KIN_ORIGIN.name, Math.round(kinRoute.total), 'nm'); } catch (err) { console.warn('[globe-live] route from', KIN_ORIGIN.name, 'unavailable', err); } }
    if (e.detail && e.detail.focus) live?.focusOn?.(KIN_ORIGIN.lng, KIN_ORIGIN.lat);   // choosing a departure turns the globe to it
  });
  // 25 Sep 2026, Simon: "try something else" — a nautical convention instead of an abstract heading offset. The
  // card sits off her AFT QUARTER (150° from the bow — the classic "always visible, never in the way" spot,
  // between dead astern and abeam), one fixed distance out, port or starboard; if her own quarter position is
  // somehow blocked, it falls back to AMIDSHIPS (directly abeam, 90°) on either side before giving up and taking
  // whichever spot is safest — "aft quarter and/or amidships", tried in that order.
  // Side choice: Simon — "favour the port side throughout" for the demo vessel and live ships on the same or a
  // similar route. Every route (real or demo) merges onto Kinship's own shared final approach, a westerly run
  // into Jersey, so one fixed preference holds for all of them rather than something computed per-route. Sign
  // convention: with `ang` in screen degrees (atan2, y down), rotating the heading by -deg lands to port, +deg to
  // starboard (checked against due-east and due-north headings) — see PREFER_SIGN below. Kept as a soft favourite,
  // not absolute: still falls back to starboard, then amidships, if port is genuinely blocked, and returns to port
  // as soon as it's safe to move again — it should never be left with nowhere to go.
  const PREFER_SIGN = -1;   // -1 = port preferred (see convention note above); flip to +1 if a future route should favour starboard instead
  // 28 Sep 2026, Simon: "skip that south-south-east position, go straight anticlockwise round to the northern
  // position" — a relocate mid-turn (rounding Ushant) was picking her new candidate off her CURRENT heading, so
  // a turn swinging further than the ±80° relocate threshold below needed two relocates: one off her transient
  // mid-turn heading (the SE stopover), then a second once she'd settled onto her new one. angLead (see call
  // site — a heading sampled a little further ahead along the route, not her instant heading) is used for the
  // candidate positions only, so a relocate anticipates where she'll actually end up; the "is the card in her
  // way right now" check just below still runs off her real current heading (ang).
  function calloutQuarter(shown, sp, ang, markerPx, cw, ch, W, Hs, margin, angLead = ang) {
    const rad = angLead * Math.PI / 180;
    const markerR = markerPx / 2;
    const standoff = markerR + Math.max(cw, ch) * 0.55 + 30;   // one fixed distance from her centre, for every candidate
    const clearance = markerR + 24;   // relocate if she gets this close to the card
    const stale = standoff * 1.6;   // relocate if the card has drifted this far from her — she's sailed on
    const preferSign = PREFER_SIGN;

    const candidateAt = (deg, sign) => {
      const a = rad + sign * deg * Math.PI / 180;
      const x = Math.max(margin, Math.min(W - cw - margin, sp.x + Math.cos(a) * standoff - cw / 2));
      const y = Math.max(margin, Math.min(Hs - ch - margin, sp.y + Math.sin(a) * standoff - ch / 2));
      return { x, y, sign };
    };
    // priority order: aft quarter (preferred side, then its mirror), then amidships the same way
    const candidates = [candidateAt(150, preferSign), candidateAt(150, -preferSign), candidateAt(90, preferSign), candidateAt(90, -preferSign)];
    // real distance from her to the nearest point ON the card rectangle — an actual distance, not a padded box
    const distToCard = c => { const nx = Math.max(c.x, Math.min(c.x + cw, sp.x)), ny = Math.max(c.y, Math.min(c.y + ch, sp.y)); return Math.hypot(nx - sp.x, ny - sp.y); };

    if (!shown) shown = { x: candidates[0].x, y: candidates[0].y, cx: candidates[0].x, cy: candidates[0].y, sign: candidates[0].sign, init: false };
    const dNow = shown.init ? distToCard({ x: shown.cx, y: shown.cy }) : -1;
    // her heading itself can turn a lot (this demo route alone swings through the Med, Gibraltar, Biscay, the
    // Channel) while the card's fixed screen position doesn't move on its own — distance alone doesn't catch a
    // spot that's technically still far enough away but has rotated from "aft" into "ahead" of her NEW heading,
    // which read as the card just sitting in front of her rather than trailing. Bearing from her to the card's
    // centre, relative to her current heading: anything inside ±80° of dead ahead forces a relocate regardless
    // of distance.
    let bearingOff = 180;
    if (shown.init) { bearingOff = Math.atan2(shown.cy + ch / 2 - sp.y, shown.cx + cw / 2 - sp.x) * 180 / Math.PI - ang; while (bearingOff > 180) bearingOff -= 360; while (bearingOff < -180) bearingOff += 360; }
    const aheadOfHer = Math.abs(bearingOff) < 80;
    if (!shown.init || dNow < clearance || dNow > stale || aheadOfHer || (shown.sign !== preferSign && dNow >= clearance)) {
      const pick = candidates.find(c => distToCard(c) >= clearance) || candidates.slice().sort((a, b) => distToCard(b) - distToCard(a))[0];   // never leave her nowhere to put it, even if every candidate is technically close
      shown.cx = pick.x; shown.cy = pick.y; shown.sign = pick.sign;
      if (!shown.init) { shown.x = pick.x; shown.y = pick.y; shown.init = true; }
    }
    shown.x += (shown.cx - shown.x) * 0.12; shown.y += (shown.cy - shown.y) * 0.12;
    // 23 Sep 2026, Simon: "the card is way off to the left, out of frame" — the eased x/y could land well past its
    // target after a fast catch-up (a `?goto=` jump, or several relocations in one scroll burst). Clamping every
    // frame guarantees the card always renders fully on-stage regardless of how the eased state got there.
    shown.x = Math.max(margin, Math.min(W - cw - margin, shown.x));
    shown.y = Math.max(margin, Math.min(Hs - ch - margin, shown.y));
    return shown;
  }
  const kinPanelEl = stage.querySelector('[data-live="panel"]');
  // 5 Nov 2026, Simon: the chevron appeared pointing along the first few miles of the route and then turned onto its track as soon as it moved (from Monaco the route first runs 337 deg for about 12 nm, out
  // of the port to the shipping lane, then 247 deg: too short a hop to see at globe scale, so it looked like a turn on the spot). Over the first KIN_LOOK_NM of the route it now points along the route
  // as it runs at that distance, so it appears already on its track; from there on it follows the route's own heading as before.
  const KIN_LOOK_NM = 40;
  function kinFwdAhead(route, uPos, n) {
    const D = Math.min(route.total - 2, Math.max(uPos * route.total, KIN_LOOK_NM)); if (!(D > 0)) return null;
    const pt = d => { const s = voyageRouteSample(route, d / route.total); return s.a.clone().lerp(s.b, s.t).normalize(); };
    const a = pt(D), b = pt(D + 2); return b.angleTo(a) > 1e-7 ? b.sub(a).normalize() : null;
  }
  function placeKinPing() {   // a small bright ping where the vessel will start (the first point of her route), same marker as the real one at the start of the journey
    const pts = kinRoute.pts, a = pts[0].clone().normalize();
    let b = pts[1]; for (let k = 1; k < pts.length && k < 40; k++) { b = pts[k]; if (b.distanceTo(pts[0]) > 1e-5) break; }
    const f = kinFwdAhead(kinRoute, 0, a) || b.clone().sub(a); f.sub(a.clone().multiplyScalar(f.dot(a))).normalize();
    const lift = CFG.radius * KIN.lift, world = globe.localToWorld(a.clone().multiplyScalar(lift)), sp = worldToStagePx(world);
    const spAhead = worldToStagePx(globe.localToWorld(a.clone().addScaledVector(f, 0.02).normalize().multiplyScalar(lift)));
    const ang = Math.atan2(spAhead.y - sp.y, spAhead.x - sp.x) * 180 / Math.PI;
    let vis = smooth(0.08, 0.30, world.clone().normalize().dot(camera.position.clone().normalize()));   // not through the back of the globe while it is still turning to her
    { const pr = kinPanelEl && kinPanelEl.getBoundingClientRect(), vx = sp.x + kinStageR.left, vy = sp.y + kinStageR.top; if (pr && vx > pr.left - 14 && vx < pr.right + 14 && vy > pr.top - 14 && vy < pr.bottom + 14) vis = 0; }   // on a narrow screen the picker covers the middle of the globe: no ping on top of its text
    const flash = Math.min(1, kinPingWave() * 1.25), t2 = `translate(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) rotate(${ang.toFixed(1)})`;
    kinAisFlash.setAttribute('transform', t2 + ` scale(${(PING_PX / 14 * (1 + flash * 0.65)).toFixed(3)})`); kinAisFlash.style.opacity = (Math.min(1, flash * 1.3) * vis).toFixed(3);
    kinAisGlow.setAttribute('transform', `translate(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) scale(${(PING_GLOW * (1 + flash * 4.2)).toFixed(2)})`); kinAisGlow.style.opacity = (flash * vis).toFixed(3);
  }
  const PING_PX = 5, PING_GLOW = 0.5;   // the preview ping's size (px, glow scale); the full marker starts at KIN_AIS.px[0] = 10 and glow scale 1
  function placeKinship(p, depth) {
    if (!kin) return;
    // 17 Sep 2026, Simon: "Observe the Channel Islands" needed to be genuinely vessel-free, not just unnamed —
    // she was still flying in on her own scripted schedule regardless of which button unlocked scroll. Same hide
    // branch as u<=0 below, just forced instead of scroll-position-driven.
    // 28 Sep 2026, Simon: "start the chevron pinging as soon as user clicks bring in demo vessel (not waiting
    // for first scroll)" — smooth(a,b,p) is exactly 0 at p===a (the click handler resets scroll to the top, so
    // p is exactly 0 right after arming), which hit the u<=0 hide branch below and held her invisible until the
    // first scroll nudged p past KIN.show[0]. Flooring u to a hair above 0 once armed skips straight to the
    // "just appeared" burst this pulse curve already has at u≈0 (wave/burst below), instead of waiting on scroll.
    const u = (voyageMonitorMode || voyageRouteMode || kinDismissed) ? 0 : Math.max(smooth(KIN.show[0], KIN.show[1], p), voyageExampleArmed ? 0.0001 : 0);   // 17 Sep 2026: Phase 4's own scripted ship uses this same hide branch while she's up — the two scripted ships are never shown at once
    if (u <= 0) {
      kin.mat.opacity = 0; kinFaceLL = null;
      if (kinAisCore) { kinAisCore.style.opacity = '0'; kinAisFlash.style.opacity = '0'; kinAisGlow.style.opacity = '0'; }
      if (kinCalloutCard) { kinCalloutCard.style.opacity = '0'; kinCalloutLine.style.opacity = '0'; }
      // 4 Nov 2026, Simon: the vessel starts pinging at the departure the moment the picker is open (Monaco is chosen by default), small but bright;
      // "Start the journey" grows it into the full chevron (below, kinGrow). Picker open = not behind the opening CTA, not folded into the voyage card, at the top of the scroll.
      if (kinRoute && kinAisFlash && !voyageMonitorMode && !voyageRouteMode && p < 0.01 && !stage.classList.contains('voyage-gate') && !stage.classList.contains('globe-intro') && !stage.classList.contains('voyage-mode')) { placeKinPing(); kinWasPing = true; kinGrowFrom = null; }
      return;
    }
    // her position: arc-length-sampled along the Monaco route when it's built (so a much longer, chokepoint-heavy
    // route still reads as constant speed — see kinRouteProgress/voyageRouteSample above), falling back to the
    // plain index/lerp along her own short track if the route somehow isn't ready yet (23 Sep 2026).
    let n, fwd;
    if (kinRoute) {
      const uPos = kinRouteProgress(kinRoute, p), samp = voyageRouteSample(kinRoute, uPos);
      n = samp.a.clone().lerp(samp.b, samp.t).normalize();
      fwd = kinFwdAhead(kinRoute, uPos, n) || samp.b.clone().sub(samp.a).normalize();
    } else {
      const i = Math.min(kin.pts.length - 2, Math.floor(u * (kin.pts.length - 1))), t = u * (kin.pts.length - 1) - i;
      const a = kin.pts[i], b = kin.pts[i + 1]; n = a.clone().lerp(b, t).normalize();
      fwd = b.clone().sub(a).normalize();
    }
    { const ll0 = vec3ToLonLat(n); kinFaceLL = { lon: ll0.lon, lat: ll0.lat }; }   // 4 Nov 2026: tick() keeps the globe turned to her (any departure), as it already did for a routed ship
    // the match cut: blend her onto the screen point seaway-wake opens on, heading east, over endBlend
    const w = smooth(KIN.endBlend[0], KIN.endBlend[1], p);
    if (w > 0) {
      const Hh = host.clientHeight || 900, Ww = host.clientWidth || 1440, tanH = Math.tan(CFG.fov / 2 * Math.PI / 180);
      const xw = ((KIN.endScreen.x - 0.02) * 2 - 1) * depth * tanH * (Ww / Hh), yw = (1 - KIN.endScreen.y * 2) * depth * tanH;   // world offsets at the surface (the host is shifted right by 2 vw)
      const Rl = CFG.radius * KIN.lift, zw = Math.sqrt(Math.max(0, Rl * Rl - xw * xw - yw * yw));
      { const hit = new THREE.Vector3(xw, yw, zw);
        const inv = globe.quaternion.clone().invert(); const nEnd = hit.applyQuaternion(inv).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(n, nEnd); const qs = new THREE.Quaternion().slerp(q, w); n = n.clone().applyQuaternion(qs).normalize();
        const eastAt = new THREE.Vector3(0, 1, 0).cross(nEnd).normalize(), northAt = nEnd.clone().cross(eastAt).normalize(); const bb = KIN.endBearing * Math.PI / 180;
        const headAt = northAt.multiplyScalar(Math.cos(bb)).addScaledVector(eastAt, Math.sin(bb)).normalize(); fwd = fwd.clone().applyQuaternion(qs).lerp(headAt, w).normalize(); }
    } const east = new THREE.Vector3(0, 1, 0).cross(n).normalize(); const north = n.clone().cross(east).normalize();
    // forward projected onto the tangent plane, then a local frame: X = right, Y = bow, Z = normal
    const f = fwd.sub(n.clone().multiplyScalar(fwd.dot(n))).normalize(); const right = f.clone().cross(n).normalize();
    kin.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, n.clone().cross(f).normalize(), n));   // X = bow (image +x), Y = port side, Z = up
    kin.mesh.position.copy(n).multiplyScalar(CFG.radius * KIN.lift);
    // she reads as an AIS blip while distant, crossfading into the detailed plan-view sprite as she closes on Jersey
    // (ported from channel-night's version, 15 Sep 2026 — same formulas, u stands in for ys). 23 Sep 2026: this
    // crossfade/size schedule now runs on uK (KIN_SPRITE_SCHEDULE, still the original late window), not u (her
    // now much wider visibility window) — see the comment above KIN_SPRITE_SCHEDULE.
    const uK = smooth(KIN_SPRITE_SCHEDULE[0], KIN_SPRITE_SCHEDULE[1], p);
    const ais = KIN_AIS, cf = ais.crossfade, planFade = smooth(cf[0], cf[1], uK), aisFade = 1 - planFade;
    let kinGrow = 1;   // 0 = the small ping, 1 = the full marker: eases up over 0.8 s once "Start the journey" has been pressed
    if (kinWasPing) { if (kinGrowFrom == null) kinGrowFrom = performance.now(); kinGrow = smooth(0, 1, (performance.now() - kinGrowFrom) / 800); if (kinGrow >= 1) kinWasPing = false; }
    const aisPx = lerp(ais.px[0], ais.px[1], smooth(0, 1, uK)) * lerp(PING_PX / ais.px[0], 1, kinGrow);
    // the plan-view sprite starts at exactly the AIS marker's size at the moment it takes over — no pop — then keeps growing
    const pxAtHandoff = lerp(ais.px[0], ais.px[1], smooth(0, 1, cf[0]));
    const px = lerp(pxAtHandoff, KIN.px[1], smooth(cf[0], 1, uK));
    const HH = host.clientHeight || 900, worldPerPx = 2 * depth * Math.tan(CFG.fov / 2 * Math.PI / 180) / HH;
    const len = px * worldPerPx; kin.mesh.scale.set(len, len, 1);
    kin.mat.opacity = planFade;

    // a bright burst on first appearance settling to a steady rhythmic pulse that keeps going — in neon orange —
    // until the crossfade; never dims to nothing between beats, just breathes between pulseFloor and full brightness
    const wave = ais.pulseFloor + (1 - ais.pulseFloor) * (0.5 + 0.5 * Math.cos(u / ais.pulsePeriod * Math.PI * 2));
    const burst = 1 + 0.8 * Math.exp(-u / ais.pulseDur * 3);
    const restPing = 1 - smooth(0, 0.02, p);   // while she is still at the start, ping on the clock (as the preview does) rather than waiting for a scroll to drive the pulse
    const flash = Math.min(1, wave * burst) * (1 - restPing) + Math.min(1, kinPingWave() * 1.25) * restPing;
    // kin.mesh.position is LOCAL to `globe` (mesh.parent), which itself spins/flies-in/settles under its own
    // quaternion — the sprite renders in the right place because three.js applies that automatically when drawing
    // it, but a manual projection needs the actual WORLD position, not the pre-rotation local one (bug, 15 Sep: this
    // put the marker/card wherever the globe's rotation happened to be, nowhere near the visible ship)
    const sp = worldToStagePx(kin.mesh.getWorldPosition(new THREE.Vector3()));   // her live position, in stage pixels — for the marker and the leader line
    // heading, in screen space: project a point a little further along her track tangent (also local -> world via
    // globe.localToWorld, same fix as her own position) and take the angle between the two projected points — the
    // marker is authored tip-right (0deg = +x/east), matching this convention (Simon, 15 Sep: "just a dot").
    // Hoisted out of the kinAisCore-only block (23 Sep 2026) since the callout below now needs `ang` too, for the
    // same trailing-behind-heading positioning Phase 4's routed-ship callout uses (see placeVoyageRoute).
    const aheadLocal = n.clone().addScaledVector(f, 0.02).normalize().multiplyScalar(CFG.radius * KIN.lift);
    const spAhead = worldToStagePx(globe.localToWorld(aheadLocal));
    const ang = Math.atan2(spAhead.y - sp.y, spAhead.x - sp.x) * 180 / Math.PI;
    // 28 Sep 2026, Simon: a second heading, sampled ~4% of the route further along than her actual position —
    // used only for the callout's relocate candidates (calloutQuarter below), not her own marker rotation (ang,
    // above, stays her real current heading). Lets a relocate mid-turn (rounding Ushant, say) land on roughly
    // where she'll be heading shortly, instead of her transient mid-turn heading — see the note above
    // calloutQuarter for why that was producing an extra stopover partway through a big turn.
    let angLead = ang;
    if (kinRoute) {
      const uPosLead = Math.min(1, kinRouteProgress(kinRoute, p) + 0.04), sampLead = voyageRouteSample(kinRoute, uPosLead);
      const nLead = sampLead.a.clone().lerp(sampLead.b, sampLead.t).normalize(), fwdLead = sampLead.b.clone().sub(sampLead.a).normalize();
      const fLead = fwdLead.sub(nLead.clone().multiplyScalar(fwdLead.dot(nLead))).normalize();
      const spLeadBase = worldToStagePx(globe.localToWorld(nLead.clone().multiplyScalar(CFG.radius * KIN.lift)));
      const spLeadAhead = worldToStagePx(globe.localToWorld(nLead.clone().addScaledVector(fLead, 0.02).normalize().multiplyScalar(CFG.radius * KIN.lift)));
      angLead = Math.atan2(spLeadAhead.y - spLeadBase.y, spLeadAhead.x - spLeadBase.x) * 180 / Math.PI;
    }

    if (kinAisCore) {
      const t2 = `translate(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) rotate(${ang.toFixed(1)})`;
      kinAisCore.setAttribute('transform', t2 + ` scale(${(aisPx / 14).toFixed(3)})`); kinAisCore.style.opacity = (aisFade * kinGrow).toFixed(3);
      // the flash itself swells a little at each peak (not just brightens) so the pulse reads clearly, not just a flicker
      kinAisFlash.setAttribute('transform', t2 + ` scale(${(aisPx / 14 * (1 + flash * 0.65)).toFixed(3)})`); kinAisFlash.style.opacity = (Math.min(1, flash * 1.3) * aisFade).toFixed(3);
      kinAisGlow.setAttribute('transform', `translate(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) scale(${(lerp(PING_GLOW, 1, kinGrow) * (1 + flash * 4.2)).toFixed(2)})`); kinAisGlow.style.opacity = (flash * aisFade).toFixed(3);
    }

    // CALLOUT — trails behind her along her live projected heading (23 Sep 2026: same technique Phase 4's routed-
    // ship callout uses, placeVoyageRoute() below — replaces the old scripted 5-waypoint path, which was hand-
    // calibrated for her old short Biscay track and can't generalise to the much longer Monaco route). Her
    // branded content (title/rows/typewriter) is unchanged — only where the card sits on screen is different.
    if (KIN_CALLOUT_ENABLED && kinCalloutCard) {
      const co = KIN_CALLOUT, coIn = VOYAGE_CARD_IN_FINDER ? 1 : smooth(0, 0.03, u), coOut = 1 - smooth(co.fadeOut[0], co.fadeOut[1], u), coOp = Math.min(coIn, coOut), typeU = VOYAGE_CARD_IN_FINDER ? 1 : u;   // in the finder the card is complete from the first frame (3 Oct 2026, Simon) rather than typing in with scroll
      kinCalloutCard.style.opacity = coOp.toFixed(3);
      if (coOp > 0.002) {
        const step = (co.in[1] - co.in[0]) / 5;
        // the card grows taller as the typewriter fills in the rows (the "For" line can wrap to 2), so keep
        // re-measuring until typing is done, then freeze — avoids both a stale (too-short) cached height and
        // a per-frame layout read once the card's size is no longer changing
        const typingDone = u - co.in[0] >= step * 5;
        if (!kinCardSize || !kinCardSize.frozen) {
          const r = kinCalloutCard.getBoundingClientRect();
          if (r.width && r.height) kinCardSize = { w: r.width, h: r.height, frozen: typingDone };
        }
        const cw = kinCardSize ? kinCardSize.w : 220, ch = kinCardSize ? kinCardSize.h : 130, margin = 14;
        // a sticky aft-quarter/amidships anchor, favouring port (see calloutQuarter above), not a screen corner
        kinCardShown = calloutQuarter(kinCardShown, sp, ang, px, cw, ch, kinStageR.width, kinStageR.height, margin, angLead);
        const tx = kinCardShown.x, ty = kinCardShown.y;
        kinCalloutCard.style.left = tx.toFixed(1) + 'px'; kinCalloutCard.style.top = ty.toFixed(1) + 'px';
        const lx = Math.max(tx, Math.min(tx + cw, sp.x)), ly = Math.max(ty, Math.min(ty + ch, sp.y));   // nearest point of the card to her
        kinCalloutLine.setAttribute('d', `M${lx.toFixed(1)},${ly.toFixed(1)} L${sp.x.toFixed(1)},${sp.y.toFixed(1)}`);
        kinCalloutLine.style.opacity = (coOp * 0.7).toFixed(3);
        kinTypeText(kinCalloutTitle, co.content.title, (typeU - co.in[0]) / step);
        // ETA — live, from her real distance-to-go (great-circle) at 14kts, not a fixed placeholder; counts down as
        // she closes in. Was kinAlongTrackLL(u) (walked the old fixed KIN_TRACK by index) — now her actual sampled
        // position (n), same technique placeVoyageRoute uses for its own Position row (vec3ToLonLat returns {lat,lon}).
        let etaVal;
        if (kinRoute) etaVal = kinFmtEta(kinRoute.total * (1 - kinRouteProgress(kinRoute, p)) / co.content.speedKts);   // 4 Nov 2026: from the route still to run (it was the straight line to St Helier), so it agrees with the preview in the picker and counts down as she sails
        else { const llNow = vec3ToLonLat(n), etaHrs = kinHaversineNm({ lat: llNow.lat, lng: llNow.lon }, co.content.destination) / co.content.speedKts; etaVal = kinFmtEta(etaHrs); }
        if (kinCalloutDist) { const vr = window.CIPS_VESSEL && window.CIPS_VESSEL.route, dt = vr && vr.departure === window.CIPS_VESSEL.departure ? vr.nmText + ' from ' + vr.from : ''; if (kinCalloutDist.textContent !== dt) kinCalloutDist.textContent = dt; }
        co.content.rows.forEach((r, idx) => kinTypeRow(kinCalloutRows[idx], r[0], r[0] === 'ETA' ? etaVal : r[1], (typeU - co.in[0] - step * (idx + 1)) / step));
      } else { kinCalloutLine.style.opacity = '0'; }
    }
  }

  /* ---------- Voyage Planner Phase 4 (17 Sep 2026): "Change Destination: Jersey" on a real selected ship ----------
     Simon: no real routing server needed — fake a plausible one on the shipping-lane network drawn further down
     (join the nearest lane, follow the network to the Channel), then merge onto Kinship's own track for the final
     approach, so the two scripted ships share one proven, calibrated ending (same match-cut, same hand-off into
     cloud-pass) instead of needing a separately-tuned corridor per arrival direction. The routing/graph math lives
     just after SHIP_LANES below (it needs that array); this is the rendering half, and mirrors placeKinship() above
     closely — same technique, reusing her own tuned end numbers (KIN/KIN_AIS) wherever the shared tail makes that
     valid, duplicated rather than generalised (matches how this file already duplicates rather than shares — see
     kinHaversineNm vs live.js's gc, live.js's selFx vs this file's kinFxSvg). */
  // where along Kinship's own 400-point curve every lead-in merges — recalibrated 18 Sep 2026 (moved further along
  // the western approach, closer to Jersey, from the original 227/49.06°N-3.26°W) so all three corridors below can
  // share one point: kin.pts index 270, 49.101°N -2.871°W. Same `?goto=globe-live:<p>` sketch-and-mark recipe her
  // own path waypoints were originally calibrated with.
  const VOYAGE_ROUTE_MERGE_INDEX = 270;
  // one lead-in per arrival corridor, all sharing the merge point above — locked in 18 Sep 2026 from Simon's marked-
  // up sketches. west: ships joining the network via Ushant itself — no lead-in needed, the ocean-transit path
  // already ends at Casquets/Ushant, so this is a direct hop from wherever the graph path naturally ends straight to
  // the merge point. north: ships whose shortest path runs via the UK West Coast/Nordic lanes (i.e. arriving from
  // north of Ushant — Iceland, the Faroes, Bergen, west of Scotland/Ireland) peel off before reaching Ushant and cut
  // through the Ushant/Land's End midpoint gateway instead of detouring down to Ushant and back up — see viaNorth's
  // graph-path truncation in planVoyageRoute() below. dover: ships arriving via the Dover gateway now turn south well
  // before Mid-Channel (lon -1.5, clear of Casquets/Mid-Channel entirely) and run down past Guernsey's west coast to
  // the merge point, per Simon's redraw — no longer routes through the literal Mid-Channel waypoint.
  const VOYAGE_ROUTE_LEADINS = {
    west:  { waypoints: [], mergeIndex: VOYAGE_ROUTE_MERGE_INDEX },
    north: { waypoints: [[49.31, -5.61]], mergeIndex: VOYAGE_ROUTE_MERGE_INDEX },
    dover: { waypoints: [[50.15, -1.50], [49.55, -2.75], [49.30, -2.90]], mergeIndex: VOYAGE_ROUTE_MERGE_INDEX }
  };
  // same end numbers as Kinship (endScreen/endBearing/endBlend/lift/px) — only her own "show" window doesn't apply,
  // since this ship's journey starts at p=0 (scroll resets there on click), not p=0.56.
  const VOYAGE_ROUTE = Object.assign({}, KIN, { show: [0.02, 1.0] });
  let routeShip = null, voyageRoute = null;   // routeShip: { mesh, mat } (built once, reused for every route); voyageRoute: { pts, cum, total } (rebuilt per click, see planVoyageRoute() below)
  async function buildVoyageRouteMesh() {
    try {
      const tex = await new Promise((res, rej) => new THREE.TextureLoader().load(new URL('../channel-night/assets/ship-plan.png', import.meta.url).href, res, undefined, rej));
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const ar = tex.image.height / tex.image.width;
      const geo = new THREE.PlaneGeometry(1, ar); const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 6; mesh.frustumCulled = false; globe.add(mesh);
      routeShip = { mesh, mat };
    } catch (e) { console.warn('[globe-live] voyage route sprite unavailable', e); }
  }
  // her own marker SVG + callout card — created dynamically (not in beat.html, same reasoning as live.js's selFx/
  // callout) since, unlike Kinship's, there's no fixed pre-built markup for a ship whose identity varies per click.
  // Reuses kin-fx/kin-ais-*/kin-callout-* CSS wholesale (beat.css) — same visual language, no new styling needed.
  const routeFxSvg = document.createElementNS(SVGNS, 'svg'); routeFxSvg.setAttribute('class', 'kin-fx'); routeFxSvg.setAttribute('aria-hidden', 'true'); stage.appendChild(routeFxSvg);
  const routeFxDefs = svgEl('defs', {}); routeFxDefs.innerHTML = '<radialGradient id="voyage-route-comet"><stop offset="0" stop-color="#fff0dc" stop-opacity="1"/><stop offset=".35" stop-color="#FF8A1E" stop-opacity=".9"/><stop offset="1" stop-color="#FF8A1E" stop-opacity="0"/></radialGradient>';
  const routeAisGlow = svgEl('circle', { class: 'kin-ais-glow', r: '9', fill: 'url(#voyage-route-comet)' });
  const routeAisCore = svgEl('path', { class: 'kin-ais-core', d: KIN_AIS_D, fill: '#C9D6E4', stroke: 'rgba(4,7,14,.55)', 'stroke-width': '0.6' });
  const routeAisFlash = svgEl('path', { class: 'kin-ais-flash', d: KIN_AIS_D, fill: '#FF7A12' });
  const routeCalloutLine = svgEl('path', { class: 'kin-callout-line', fill: 'none' });
  routeFxSvg.append(routeFxDefs, routeAisGlow, routeAisCore, routeAisFlash, routeCalloutLine);
  const routeCalloutCard = document.createElement('div'); routeCalloutCard.className = 'kin-callout-card voyage-route-callout'; (VOYAGE_CARD_IN_FINDER && voyageSlot ? voyageSlot : stage).appendChild(routeCalloutCard);
  // 18 Sep 2026, Simon's first-pass feedback: every card up while a chevron is travelling needs its own "X" —
  // Kinship's scripted one already has kinCalloutClose (beat.html); this one had none. Same cancel-and-restart as
  // every other close button in this beat — reuses voyagePanelClose rather than duplicating its reset logic.
  const routeCalloutClose = document.createElement('button'); routeCalloutClose.type = 'button'; routeCalloutClose.className = 'kin-callout-close'; routeCalloutClose.setAttribute('aria-label', 'Cancel and start over'); routeCalloutClose.innerHTML = '&times;';
  routeCalloutClose.addEventListener('click', () => voyagePanelClose?.click());
  routeCalloutCard.appendChild(routeCalloutClose);
  const routeCalloutTitle = document.createElement('div'); routeCalloutTitle.className = 'kin-callout-title'; routeCalloutCard.appendChild(routeCalloutTitle);
  // same subtitle every other card/callout has under the name — live.js's renderCard()/renderCallout() (.ldist/
  // .kin-callout-dist) — just counting down here instead of being read fresh off her real position each render.
  const routeCalloutDist = document.createElement('div'); routeCalloutDist.className = 'kin-callout-dist'; routeCalloutCard.appendChild(routeCalloutDist);
  // rows rebuilt wholesale once, on arm (variable count per ship — IMO/type/dimensions are conditional, unlike
  // Kinship's fixed 4), not typed out row-by-row the way her card is — a deliberate simplification, easy to revisit
  // if Simon wants the same typewriter treatment here once the rest of this is proven.
  const routeCalloutBody = document.createElement('div'); routeCalloutCard.appendChild(routeCalloutBody);
  let routeCalloutPosEl = null, routeCalloutEtaEl = null, routeCardSize = null;
  let routeCardShown = null;   // which corner of her the card sits at (see placeVoyageRoute), and where it's currently drawn (eased toward its target)
  const fmtNmVoyage = n => n >= 100 ? Math.round(n) + ' nm' : n.toFixed(1) + ' nm';   // same shape as live.js's own fmtNm — duplicated, not imported, matching this file's existing convention
  // same shape as live.js's own fmtEta — duplicated rather than imported, matching this file's existing
  // haversine/etc. duplication instead of adding a cross-file import for one line.
  const fmtEtaVoyage = h => !isFinite(h) || h <= 0 ? '—' : h < 1 ? Math.round(h * 60) + ' min' : h < 48 ? Math.round(h) + ' h' : (h / 24).toFixed(1) + ' days';
  function vec3ToLonLat(v) {   // inverse of lonLatToVec3(lon,lat,1) — for showing the route ship's own simulated position
    const y = Math.max(-1, Math.min(1, v.y)), lat = 90 - Math.acos(y) * 180 / Math.PI;
    const theta = Math.atan2(v.z, -v.x); let lon = theta * 180 / Math.PI - 180; lon = ((lon + 540) % 360) - 180;
    return { lat, lon };
  }
  // 19 Sep 2026, Simon (Ocean Dreamwalker + Executioner): "the ship sprite is too far behind the centre by the time
  // the camera zooms in around p 77%". The route used to be paced as one smooth 0..1 sweep over the WHOLE scroll, so
  // on a long route she was still hundreds of nm short of the Channel when the deep zoom onto Jersey began (p 0.70 —
  // Kinship, by contrast, is on her final approach by then, her whole track being the last leg). Now paced in two
  // phases keyed to the camera: the long ocean transit fills p 0.02..VOYAGE_ROUTE_MERGE_P (gentle ease-in, then
  // constant speed), so she reaches the merge point exactly as the deep zoom starts; the tail (Kinship's own track
  // from the merge point on) then takes the rest of the scroll with an ease-out into the match cut — a ship who's
  // been at sea for days slows for the final approach. Returns arc-length fraction (0..1) of the whole route.
  const VOYAGE_ROUTE_MERGE_P = 0.70;
  function voyageRouteProgress(route, p) {
    const p0 = VOYAGE_ROUTE.show[0], pm = VOYAGE_ROUTE_MERGE_P, tf = route.tailStart / route.total;
    if (p <= p0) return 0;
    if (p < pm) { const x = (p - p0) / (pm - p0), a = 0.1, s = x < a ? x * x / (2 * a) : x - a / 2; return tf * s / (1 - a / 2); }
    const x = Math.min(1, (p - pm) / (1 - pm));
    return tf + (1 - tf) * x * (2 - x);
  }
  function voyageRouteSample(route, u) {   // arc-length lookup (not index/waypoint-count) — routes vary hugely in real length, so pacing has to read as constant speed regardless
    const target = Math.max(0, Math.min(1, u)) * route.total;
    let lo = 0, hi = route.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (route.cum[mid] <= target) lo = mid; else hi = mid; }
    const segLen = route.cum[hi] - route.cum[lo];
    return { a: route.pts[lo], b: route.pts[hi], t: segLen > 1e-9 ? (target - route.cum[lo]) / segLen : 0 };
  }
  // 23 Sep 2026: same two-phase camera-keyed arc-length pacing as voyageRouteProgress() above (duplicated, not
  // shared, matching this file's own convention — see the comment above Phase 4's own section), just closing
  // over Kinship's own show window/merge point instead of VOYAGE_ROUTE's, since her Monaco route is fixed/
  // precomputed rather than rebuilt per click.
  const KIN_MERGE_P = 0.70;
  function kinRouteProgress(route, p) {
    const p0 = KIN.show[0], pm = KIN_MERGE_P, tf = route.tailStart / route.total;
    if (p <= p0) return 0;
    if (p < pm) { const x = (p - p0) / (pm - p0), a = 0.1, s = x < a ? x * x / (2 * a) : x - a / 2; return tf * s / (1 - a / 2); }
    const x = Math.min(1, (p - pm) / (1 - pm));
    return tf + (1 - tf) * x * (2 - x);
  }
  // static identity rows (name/IMO/type/dimensions) built once here; Position/ETA are cached element refs, updated
  // via a single textContent write each frame in placeVoyageRoute() below — not a full innerHTML rebuild every frame.
  function armVoyageRouteCallout(snapshot) {
    routeCalloutTitle.textContent = snapshot.name || ('MMSI ' + snapshot.mmsi);
    { const meta = [snapshot.typeLabel, snapshot.len > 0 ? Math.round(snapshot.len) + ' m' : ''].filter(Boolean).join(' · '); if (meta) { const sm = document.createElement('small'); sm.className = 'lmeta'; sm.textContent = meta; routeCalloutTitle.appendChild(document.createTextNode(' ')); routeCalloutTitle.appendChild(sm); } }   // 14 Oct 2026, Simon: type and LOA beside the name here too
    routeCalloutDist.textContent = (voyageRoute ? fmtNmVoyage(voyageRoute.total) : '—') + ' from St Helier';
    let rowsHtml = '';
    if (snapshot.imo) rowsHtml += '<div class="kin-callout-row"><span class="k">IMO</span><span class="v">' + snapshot.imo + '</span></div>';
    if (snapshot.typeLabel) rowsHtml += '<div class="kin-callout-row"><span class="k">Type</span><span class="v">' + snapshot.typeLabel + '</span></div>';
    if (snapshot.draught) rowsHtml += '<div class="kin-callout-row"><span class="k">Draft</span><span class="v">' + snapshot.draught + ' m</span></div>';   // LOA now sits beside the name (14 Oct 2026)
    rowsHtml += '<div class="kin-callout-row"><span class="k">Position</span><span class="v" data-voyage="pos">—</span></div>';
    rowsHtml += '<div class="kin-callout-row"><span class="k">Destination</span><span class="v">Jersey</span></div>';
    rowsHtml += '<div class="kin-callout-row"><span class="k">ETA</span><span class="v" data-voyage="eta">—</span></div>';
    routeCalloutBody.innerHTML = rowsHtml;
    routeCalloutPosEl = routeCalloutBody.querySelector('[data-voyage="pos"]'); routeCalloutEtaEl = routeCalloutBody.querySelector('[data-voyage="eta"]');
    routeCardSize = null; routeCardShown = null;
  }
  function placeVoyageRoute(p, depth) {
    if (!voyageRouteMode || !routeShip || !voyageRoute) {
      if (routeShip) routeShip.mat.opacity = 0;
      routeAisCore.style.opacity = '0'; routeAisFlash.style.opacity = '0'; routeAisGlow.style.opacity = '0';
      routeCalloutCard.style.opacity = '0'; routeCalloutLine.style.opacity = '0';
      return;
    }
    const u = smooth(VOYAGE_ROUTE.show[0], VOYAGE_ROUTE.show[1], p);
    if (u <= 0) {
      routeShip.mat.opacity = 0;
      routeAisCore.style.opacity = '0'; routeAisFlash.style.opacity = '0'; routeAisGlow.style.opacity = '0';
      routeCalloutCard.style.opacity = '0'; routeCalloutLine.style.opacity = '0';
      return;
    }
    const uPos = voyageRouteProgress(voyageRoute, p);   // where she IS along the route (camera-keyed pacing, above); u stays the plain scroll ease that drives the chevron's pulse/callout fade
    const uK = smooth(KIN_SPRITE_SCHEDULE[0], KIN_SPRITE_SCHEDULE[1], p);      // her chevron->sprite hand-off and sprite size follow this fixed late-window schedule (not KIN.show, which is her much wider visibility window as of 23 Sep) — so after the merge this ship looks exactly like the demo vessel does at the same scroll position (route-length-independent)
    const samp = voyageRouteSample(voyageRoute, uPos);
    let n = samp.a.clone().lerp(samp.b, samp.t).normalize();
    let fwd = samp.b.clone().sub(samp.a).normalize();
    // the match cut: blend her onto the same fixed screen point/heading Kinship's own track ends on — driven by
    // beat progress p (not by u or distance remaining), so it forces the correct final position regardless of how
    // long the real route was, exactly the trick that lets one shared ending work for any arrival direction/length.
    const w = smooth(VOYAGE_ROUTE.endBlend[0], VOYAGE_ROUTE.endBlend[1], p);
    if (w > 0) {
      const Hh = host.clientHeight || 900, Ww = host.clientWidth || 1440, tanH = Math.tan(CFG.fov / 2 * Math.PI / 180);
      const xw = ((VOYAGE_ROUTE.endScreen.x - 0.02) * 2 - 1) * depth * tanH * (Ww / Hh), yw = (1 - VOYAGE_ROUTE.endScreen.y * 2) * depth * tanH;
      const Rl = CFG.radius * VOYAGE_ROUTE.lift, zw = Math.sqrt(Math.max(0, Rl * Rl - xw * xw - yw * yw));
      const hit = new THREE.Vector3(xw, yw, zw);
      const inv = globe.quaternion.clone().invert(); const nEnd = hit.applyQuaternion(inv).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(n, nEnd); const qs = new THREE.Quaternion().slerp(q, w); n = n.clone().applyQuaternion(qs).normalize();
      const eastAt = new THREE.Vector3(0, 1, 0).cross(nEnd).normalize(), northAt = nEnd.clone().cross(eastAt).normalize(); const bb = VOYAGE_ROUTE.endBearing * Math.PI / 180;
      const headAt = northAt.multiplyScalar(Math.cos(bb)).addScaledVector(eastAt, Math.sin(bb)).normalize(); fwd = fwd.clone().applyQuaternion(qs).lerp(headAt, w).normalize();
    }
    const f = fwd.sub(n.clone().multiplyScalar(fwd.dot(n))).normalize();
    routeShip.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, n.clone().cross(f).normalize(), n));
    routeShip.mesh.position.copy(n).multiplyScalar(CFG.radius * VOYAGE_ROUTE.lift);
    { const ll = vec3ToLonLat(n); voyageRouteFaceLL = { lon: ll.lon, lat: ll.lat }; }   // read by tick()'s camera-centring blend, next frame

    const ais = KIN_AIS, cf = ais.crossfade, planFade = smooth(cf[0], cf[1], uK), aisFade = 1 - planFade;
    const aisPx = lerp(ais.px[0], ais.px[1], smooth(0, 1, uK));
    const pxAtHandoff = lerp(ais.px[0], ais.px[1], smooth(0, 1, cf[0]));
    const px = lerp(pxAtHandoff, VOYAGE_ROUTE.px[1], smooth(cf[0], 1, uK));
    const HH = host.clientHeight || 900, worldPerPx = 2 * depth * Math.tan(CFG.fov / 2 * Math.PI / 180) / HH;
    const len = px * worldPerPx; routeShip.mesh.scale.set(len, len, 1);
    routeShip.mat.opacity = planFade;

    const wave = ais.pulseFloor + (1 - ais.pulseFloor) * (0.5 + 0.5 * Math.cos(u / ais.pulsePeriod * Math.PI * 2));
    const burst = 1 + 0.8 * Math.exp(-u / ais.pulseDur * 3);
    const flash = Math.min(1, wave * burst);
    const sp = worldToStagePx(routeShip.mesh.getWorldPosition(new THREE.Vector3()));

    const aheadLocal = n.clone().addScaledVector(f, 0.02).normalize().multiplyScalar(CFG.radius * VOYAGE_ROUTE.lift);
    const spAhead = worldToStagePx(globe.localToWorld(aheadLocal));
    const ang = Math.atan2(spAhead.y - sp.y, spAhead.x - sp.x) * 180 / Math.PI;
    const t2 = `translate(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) rotate(${ang.toFixed(1)})`;
    routeAisCore.setAttribute('transform', t2 + ` scale(${(aisPx / 14).toFixed(3)})`); routeAisCore.style.opacity = aisFade.toFixed(3);
    routeAisFlash.setAttribute('transform', t2 + ` scale(${(aisPx / 14 * (1 + flash * 0.65)).toFixed(3)})`); routeAisFlash.style.opacity = (Math.min(1, flash * 1.3) * aisFade).toFixed(3);
    routeAisGlow.setAttribute('transform', `translate(${sp.x.toFixed(1)},${sp.y.toFixed(1)}) scale(${(1 + flash * 4.2).toFixed(2)})`); routeAisGlow.style.opacity = (flash * aisFade).toFixed(3);

    // CALLOUT — no scripted screen-space path (unlike Kinship's, calibrated for her one fixed track): she can start
    // anywhere in the world, so this just follows her live projected position directly (pullToShip's own 100% case),
    // with the same never-overtake / stay-on-screen clamps as Kinship's.
    const coIn = smooth(0, 0.03, u), coOut = VOYAGE_CARD_IN_FINDER ? 1 : 1 - smooth(0.74, 0.80, p), coOp = Math.min(coIn, coOut);   // in the finder the card stays for the whole voyage (3 Oct 2026) — it isn't covering the scene any more
    routeCalloutCard.style.opacity = coOp.toFixed(3);
    if (coOp > 0.002) {
      if (!routeCardSize) { const r = routeCalloutCard.getBoundingClientRect(); if (r.width && r.height) routeCardSize = { w: r.width, h: r.height }; }
      const cw = routeCardSize ? routeCardSize.w : 260, ch = routeCardSize ? routeCardSize.h : 220, margin = 14;
      // a sticky aft-quarter/amidships anchor, favouring port (calloutQuarter, above) — holds for any arrival
      // direction without per-ship calibration; relocates only when she's too close, too far, or she's had to
      // sit on starboard/amidships for a moment and it's now safe to swing back to the preferred port side.
      routeCardShown = calloutQuarter(routeCardShown, sp, ang, px, cw, ch, kinStageR.width, kinStageR.height, margin);
      const tx = routeCardShown.x, ty = routeCardShown.y;
      routeCalloutCard.style.left = tx.toFixed(1) + 'px'; routeCalloutCard.style.top = ty.toFixed(1) + 'px';
      const lx = Math.max(tx, Math.min(tx + cw, sp.x)), ly = Math.max(ty, Math.min(ty + ch, sp.y));   // nearest point of the card to her
      routeCalloutLine.setAttribute('d', `M${lx.toFixed(1)},${ly.toFixed(1)} L${sp.x.toFixed(1)},${sp.y.toFixed(1)}`);
      routeCalloutLine.style.opacity = (coOp * 0.7).toFixed(3);
      if (routeCalloutPosEl) { const ll = vec3ToLonLat(n); const posTxt = Math.abs(ll.lat).toFixed(2) + '°' + (ll.lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(ll.lon).toFixed(2) + '°' + (ll.lon >= 0 ? 'E' : 'W'); if (routeCalloutPosEl.textContent !== posTxt) routeCalloutPosEl.textContent = posTxt; }
      const distNm = voyageRoute.total * (1 - uPos);
      const distTxt = fmtNmVoyage(distNm) + ' from St Helier';
      if (routeCalloutDist.textContent !== distTxt) routeCalloutDist.textContent = distTxt;
      if (routeCalloutEtaEl) {
        const etaTxt = fmtEtaVoyage(distNm / 14) + ' @14kn';
        if (routeCalloutEtaEl.textContent !== etaTxt) routeCalloutEtaEl.textContent = etaTxt;
      }
    } else { routeCalloutLine.style.opacity = '0'; }
  }

  async function buildNight() { await buildNightPatch(NIGHT.z, NIGHT, -3, CFG.radius * 1.0015, [0.56, 0.74]); }
  async function buildNightPatch(z, box, order, radius, fadeIn) {
    const n = Math.pow(2, z), D2R = Math.PI / 180;
    const tx = lon => (lon + 180) / 360 * n, ty = lat => (1 - Math.log(Math.tan(lat * D2R) + 1 / Math.cos(lat * D2R)) / Math.PI) / 2 * n;
    const x0 = Math.floor(tx(box.lonMin)), x1 = Math.floor(tx(box.lonMax)), y0 = Math.floor(ty(box.latMax)), y1 = Math.floor(ty(box.latMin));
    const cols = x1 - x0 + 1, rows = y1 - y0 + 1, T = 256;
    const cv = document.createElement('canvas'); cv.width = cols * T; cv.height = rows * T; const c = cv.getContext('2d');
    const load = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    const url = (t, x, y) => t.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    const lurlOf = (x, y) => NIGHT.lights.replace('{z}', Math.min(z, 8)).replace('{x}', x).replace('{y}', y);
    const jobs = [];
    // lights only exist to z8 on GIBS: above that, fetch the z8 parent tile and crop the matching quarter(s)
    const LZ = Math.min(z, 8), lf = Math.pow(2, z - LZ);
    const lightsFor = async (x, y) => { const im = await load(lurlOf(Math.floor(x / lf), Math.floor(y / lf))); if (!im || lf === 1) return im; const c2 = document.createElement('canvas'); c2.width = c2.height = T; c2.getContext('2d').drawImage(im, (x % lf) * T / lf, (y % lf) * T / lf, T / lf, T / lf, 0, 0, T, T); return c2; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push(Promise.all([load(url(NIGHT.imagery, x, y)), lightsFor(x, y)]).then(([a, b]) => ({ x, y, a, b })));
    const tiles = await Promise.all(jobs);
    for (const t of tiles) { const dx = (t.x - x0) * T, dy = (t.y - y0) * T; if (t.a) c.drawImage(t.a, dx, dy, T, T); }
    c.fillStyle = 'rgba(2,6,14,' + NIGHT.tint + ')'; c.fillRect(0, 0, cv.width, cv.height);          // push the day toward night
    c.globalCompositeOperation = 'lighter'; for (const t of tiles) { if (t.b) c.drawImage(t.b, (t.x - x0) * T, (t.y - y0) * T, T, T); } c.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4; if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const lonA = x0 / n * 360 - 180, lonB = (x1 + 1) / n * 360 - 180;
    const latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R; const latA = latOf(y1 + 1), latB = latOf(y0);
    const geo = patchGeometry(lonA, lonB, latA, latB, (lon, lat) => [(tx(lon) - x0) / cols, 1 - (ty(lat) - y0) / rows], radius, z >= 9 ? 48 : 96, z >= 9 ? 48 : 64);
    const mat = addPatch(tex, geo, order, radius, fadeIn); if (z === NIGHT.z) { nightMat = mat; }
    console.log('[globe-live] night aerial on the sphere: z' + z, cols + '×' + rows, 'tiles, missing', tiles.filter(t => !t.a).length);
  }
  const COAST_BOX = { lonMin: -8.5, lonMax: 5.5, latMin: 46.8, latMax: 53.2 };
  async function buildCoast() {
    const rings = [];
    try { const topo = await fetch(new URL('../_vendor/world-atlas-2/land-10m.json', import.meta.url).href, { cache: 'force-cache' }).then(r => r.json());
      const geo = topojson.feature(topo, topo.objects.land); const feats = geo.type === 'FeatureCollection' ? geo.features : [geo];
      feats.forEach(f => { const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; polys.forEach(pp => pp.forEach(r => rings.push(r))); });
    } catch (e) { console.warn('[globe-live] coast 10m unavailable', e); }
    if (CIGEO && CIGEO.features) CIGEO.features.forEach(f => { const g = f.geometry; if (g.type === 'Polygon') g.coordinates.forEach(r => rings.push(r)); });
    const inBox = q => q[0] >= COAST_BOX.lonMin && q[0] <= COAST_BOX.lonMax && q[1] >= COAST_BOX.latMin && q[1] <= COAST_BOX.latMax;
    const arr = [];
    for (const r of rings) for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i]; if (!inBox(a) && !inBox(b)) continue;
      const u = lonLatToVec3(a[0], a[1], CFG.radius * 1.0032), v = lonLatToVec3(b[0], b[1], CFG.radius * 1.0032); arr.push(u.x, u.y, u.z, v.x, v.y, v.z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    coastMat = new THREE.LineBasicMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0, depthWrite: false });
    coastLines = new THREE.LineSegments(geo, coastMat); coastLines.frustumCulled = false; coastLines.renderOrder = 5; globe.add(coastLines);
    console.log('[globe-live] coast outline segments:', arr.length / 6);
  }
  function scrollProgress(){ return __p; }   // p is supplied by the beat runtime (update(p))
  function smooth(a, b, x){ x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  
  // mouse drag to rotate the globe (mainly the world view)
  // 22 Oct 2026, Simon: flick it like a desk globe. Letting go keeps the speed of the flick and it slows down by itself (friction), instead of stopping dead.
  const SPIN_FRICTION = 0.982;      // per frame at 60 fps: closer to 1 = keeps spinning longer, lower = stops sooner (23 Oct 2026, Simon: "a bit freer": was 0.972, about two seconds; 0.982 is about three)
  const SPIN_MAX_VEL = 0.065;       // fastest a flick can leave it spinning, radians per frame (about 220 degrees a second; was 0.05)
  let dragging = false, dragYaw = 0, dragPitch = 0, lastPX = 0, lastPY = 0, lastMoveT = 0, velYaw = 0, velPitch = 0;
  const dom = renderer.domElement;
  dom.style.cursor = 'grab';
  dom.addEventListener('pointerdown', e => { dragging = true; velYaw = 0; velPitch = 0; lastMoveT = performance.now(); lastPX = e.clientX; lastPY = e.clientY; dom.style.cursor = 'grabbing'; try { dom.setPointerCapture(e.pointerId); } catch (_) {} });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    const nowT = performance.now(), dt = Math.max(4, nowT - lastMoveT), dy = (e.clientX - lastPX) * 0.005, dp = (e.clientY - lastPY) * 0.005;
    dragYaw += dy;
    dragPitch = Math.max(-0.8, Math.min(0.8, dragPitch + dp));
    velYaw = velYaw * 0.55 + (dy / dt * 16.666) * 0.45;       // the speed of the hand, smoothed, as radians per frame
    velPitch = velPitch * 0.55 + (dp / dt * 16.666) * 0.45;
    lastMoveT = nowT; lastPX = e.clientX; lastPY = e.clientY;
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false; dom.style.cursor = 'grab';
    if (performance.now() - lastMoveT > 90) { velYaw = 0; velPitch = 0; }   // held still before letting go: no flick
    velYaw = Math.max(-SPIN_MAX_VEL, Math.min(SPIN_MAX_VEL, velYaw)); velPitch = Math.max(-SPIN_MAX_VEL, Math.min(SPIN_MAX_VEL, velPitch));
  });
  /* settleFocus (17 Sep 2026, Simon) — live.js's "Go to ship" turns the globe to face the selected vessel by
     blending q toward a target quaternion (focusQuat) over about a second (live.js's focusMix ramp). That blend
     used to just stay at full strength forever once it reached the target, which meant the globe was effectively
     locked against drag from then on — dragYaw/dragPitch kept accumulating from pointer input, but the slerp toward
     the fixed focusQuat swallowed almost all of it, so dragging looked broken. This folds the CURRENT blended
     orientation into startQuat and zeroes spin/drag, so q (unblended) already equals where the camera is now
     sitting — live.js can then drop focusQuat entirely with zero visual jump, and drag/idle-spin take back over
     exactly from there, same as before any ship was ever selected. */
  function settleFocus(targetQuat) {
    const rx = new THREE.Quaternion().setFromAxisAngle(XAXIS, BASE_X);
    rx.invert().multiply(targetQuat);
    startQuat.copy(rx);
    spinY = 0; dragYaw = 0; dragPitch = 0; velYaw = 0; velPitch = 0;
  }

  const globe = new THREE.Group();
  scene.add(globe);
  
  /* ---------- helpers ---------- */
  // lon/lat (deg) -> point on sphere of radius r
  function lonLatToVec3(lon, lat, r = CFG.radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }
  
  // soft round dot sprite (radial gradient) — solid core, feathered rim
  function dotSprite(size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, r * 0.82, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r, r, r - 0.5, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  const SPRITE = dotSprite(64);
  // 5 Nov 2026, Simon: the city dots as pin pricks / stars of light: a small white-hot core in a warm orange halo, with a faint four-point glint (drawn white; the colour is in the picture)
  const STAR = (() => { const s = 64, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), m = s / 2;
    const rg = g.createRadialGradient(m, m, 0, m, m, m); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.16, 'rgba(255,244,222,1)'); rg.addColorStop(0.3, 'rgba(255,160,70,.9)');
    rg.addColorStop(0.55, 'rgba(244,83,0,.35)'); rg.addColorStop(1, 'rgba(244,83,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter'; for (const [w, h] of [[s, 1.6], [1.6, s]]) { const lg = w > h ? g.createLinearGradient(0, 0, s, 0) : g.createLinearGradient(0, 0, 0, s);
      lg.addColorStop(0, 'rgba(255,200,140,0)'); lg.addColorStop(0.5, 'rgba(255,236,210,.55)'); lg.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = lg; g.fillRect(m - w / 2, m - h / 2, w, h); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  let endpointMat = null;
  
  // point-in-ring (ray casting), ring = [[lon,lat],...]
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      const denom = yj - yi; if (denom === 0) continue;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function pointInPolygon(x, y, rings) {
    if (!pointInRing(x, y, rings[0])) return false;         // outer
    for (let k = 1; k < rings.length; k++)                  // holes
      if (pointInRing(x, y, rings[k])) return false;
    return true;
  }
  function bbox(ring) {
    let minLon = 1e9, maxLon = -1e9, minLat = 90, maxLat = -90;
    for (const [L, A] of ring) {
      if (L < minLon) minLon = L; if (L > maxLon) maxLon = L;
      if (A < minLat) minLat = A; if (A > maxLat) maxLat = A;
    }
    return { minLon, maxLon, minLat, maxLat };
  }
  
  // build a Points layer from an array of THREE.Vector3
  function makePoints(positions, color, size, opacity, killBack, additive) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => { arr[i*3] = p.x; arr[i*3+1] = p.y; arr[i*3+2] = p.z; });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size, map: SPRITE, sizeAttenuation: true,
      transparent: true, opacity, depthWrite: false, alphaTest: 0,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
  
    // front-face cull + rim-angle shrink (after unitedcarriers technique)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCamPos = { value: new THREE.Vector3() };
      sh.uniforms.uBackOpacity = { value: CFG.backOpacity };
      sh.uniforms.uRimBoost = { value: CFG.dotRimBoost };
      mat.userData.shader = sh;
      if (killBack) { mat.defines = mat.defines || {}; mat.defines.KILL_BACK = 1; }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>',
          '#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uCamPos;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>',
          '#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uCamPos;\nuniform float uBackOpacity;\nuniform float uRimBoost;')
        .replace('#include <color_fragment>',
          '#include <color_fragment>\n{\nvec3 viewDir = normalize(uCamPos - vWorldPos);\nvec3 normalDir = normalize(vWorldPos);\nfloat nd = dot(viewDir, normalDir);\n#ifdef KILL_BACK\nif (nd <= 0.0) discard;\n#else\ndiffuseColor.a *= mix(uBackOpacity, 1.0, smoothstep(0.0, 0.25, nd));\n#endif\ndiffuseColor.rgb *= (1.0 + uRimBoost * (1.0 - smoothstep(0.0, 0.5, nd)));\n}');
    };
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }
  
  /* ---------- generate dots from land polygons ----------
     One even grid over the land (UC technique). Each land dot is classified:
     - coastline  = a land cell that has at least one SEA neighbour  -> bright
     - interior   = all neighbours are land                          -> faint
     Both belong to the SAME matrix; the coastline is just lit brighter.        */
  function generateDots(polygons) {
    const R = CFG.radius, step = CFG.tileDeg;
  
    // Unwrap a ring's longitudes so it doesn't jump across the ±180 seam
    // (fixes false rings from Antarctica / polygons crossing the antimeridian).
    function unwrapRing(ring, refLon) {
      const out = new Array(ring.length); let prev = null;
      for (let i = 0; i < ring.length; i++) {
        let L = ring[i][0]; const A = ring[i][1];
        let d = L - refLon; if (d > 180) L -= 360; else if (d < -180) L += 360;
        if (prev) { const s = L - prev[0]; if (s > 180) L -= 360; else if (s < -180) L += 360; }
        out[i] = [L, A]; prev = out[i];
      }
      return out;
    }
  
    // precompute per polygon: unwrapped rings + bbox + reference longitude
    const polys = polygons.map(rings => {
      const b0 = bbox(rings[0]); let ref = (b0.minLon + b0.maxLon) / 2;
      let uRings = rings.map(r => unwrapRing(r, ref));
      let bb = bbox(uRings[0]);
      ref = (bb.minLon + bb.maxLon) / 2;          // recentre & re-unwrap for stability
      uRings = rings.map(r => unwrapRing(r, ref));
      bb = bbox(uRings[0]);
      return { uRings, bb, ref };
    });
  
    // 5 Nov 2026 (load speed, Simon: the globe sat on a blank screen too long): the same even-odd ray cast as pointInRing, done once per
    // latitude row instead of once per dot. For a row, every ring's crossings of that latitude are worked out once (the same formula and the
    // same rule for which edges count, so the answers are identical), sorted, and a dot is inside a ring when an odd number of crossings lie
    // to its east. Was about 1.5 s on a fast PC (the "Building the matrix" wait); now a few tens of ms. Same dots, same places.
    const rowCache = new Map();
    function rowCrossings(lat) {
      let row = rowCache.get(lat); if (row) return row;
      row = [];
      for (const p of polys) {
        const b = p.bb; if (lat < b.minLat || lat > b.maxLat) continue;
        const rings = p.uRings.map(ring => {
          const xs = [];
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            const denom = yj - yi; if (denom === 0) continue;
            if ((yi > lat) !== (yj > lat)) xs.push((xj - xi) * (lat - yi) / denom + xi);
          }
          return Float64Array.from(xs).sort();
        });
        row.push({ p, rings });
      }
      rowCache.set(lat, row); return row;
    }
    const eastOf = (xs, x) => { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] > x) hi = m; else lo = m + 1; } return xs.length - lo; };   // how many crossings lie strictly east of x
    function isLand(lon, lat) {
      for (const { p, rings } of rowCrossings(lat)) {
        let L = lon; const d = L - p.ref;         // bring test point into the polygon's frame
        if (d > 180) L -= 360; else if (d < -180) L += 360;
        const b = p.bb;
        if (L < b.minLon || L > b.maxLon) continue;
        if (!(eastOf(rings[0], L) & 1)) continue;                                   // outside the outer ring
        let hole = false; for (let k = 1; k < rings.length && !hole; k++) hole = !!(eastOf(rings[k], L) & 1);
        if (!hole) return true;
      }
      return false;
    }
  
    const fill = [], edge = [];
    let row = 0;
    for (let lat = CFG.latMin; lat < CFG.latMax; lat += step, row++) {
      const cosLat = Math.cos(lat * Math.PI / 180);
      const lonStep = step / Math.max(0.15, cosLat);   // even spacing toward poles
      const off = (row % 2) ? lonStep * 0.5 : 0;        // stagger alternate rows
      for (let lon = -180; lon < 180; lon += lonStep) {
        const LO = lon + off, LA = lat;
        if (!isLand(LO, LA)) continue;
        // coastline = at least one cardinal neighbour is sea
        const coast =
          !isLand(LO + lonStep, LA) || !isLand(LO - lonStep, LA) ||
          !isLand(LO, LA + step)    || !isLand(LO, LA - step);
        const v = lonLatToVec3(LO, LA, R * 1.002);
        (coast ? edge : fill).push(v);
      }
    }
    return { fill, edge };
  }
  
  /* ---------- arcs (United Carriers comet technique) ---------- */
  const ARC_T = { value: 0 };                        // shared comet clock
  const ARC_TH = { value: 0.0022 };                  // shared arc thickness (thins on scroll)
  const labelObjs = [];                              // name labels at endpoints
  const worldFade = [];                              // {mat, base} — world layers that fade as islands resolve
  let islandsGroup = null, islandFillMat = null, islandEdgeMat = null;
  let LAND_POLYS = null;                              // parsed land-110m polygons (reused for the region map)
  const CI = { lat: 49.19, lng: -2.11, name: 'Channel Islands' };
  const P = {
    caribbean: { lat: 18.0,   lng: -63.0,  name: 'Caribbean' },
    gibraltar: { lat: 36.14,  lng: -5.35,  name: 'Gibraltar' },
    monaco:    { lat: 43.74,  lng: 7.42,   name: 'Monaco' },
    palma:     { lat: 39.57,  lng: 2.65,   name: 'Palma' },
    newyork:   { lat: 40.71,  lng: -74.01, name: 'New York' },
    vancouver: { lat: 49.28,  lng: -123.12, name: 'Vancouver' },
    dubai:     { lat: 25.20,  lng: 55.27,  name: 'Dubai' },
    capetown:  { lat: -33.92, lng: 18.42,  name: 'Cape Town' },
    london:    { lat: 51.51,  lng: -0.13,  name: 'London' },
    paris:     { lat: 48.85,  lng: 2.35,   name: 'Paris' },
    amsterdam: { lat: 52.37,  lng: 4.90,   name: 'Amsterdam' },
    rotterdam: { lat: 51.95,  lng: 4.14,   name: 'Rotterdam' },
    hamburg:   { lat: 53.55,  lng: 9.99,   name: 'Hamburg' },
    oslo:      { lat: 59.91,  lng: 10.75,  name: 'Oslo' }
  };
  const ROUTES = [
    // world -> islands
    [P.caribbean, CI], [P.gibraltar, CI], [P.monaco, CI], [P.palma, CI],
    [P.newyork, CI], [P.vancouver, CI], [P.dubai, CI], [P.capetown, CI],
    // islands -> onward
    [CI, P.london], [CI, P.paris], [CI, P.amsterdam], [CI, P.rotterdam], [CI, P.hamburg], [CI, P.oslo]
  ];
  const KEEP = new Set(['London', 'Paris', 'Amsterdam']); // flights that continue through the crossfade
  const keepArcs = [];
  
  // spherical interpolation between two unit vectors
  function slerpUnit(a, b, t) {
    const om = a.angleTo(b); if (om < 1e-6) return a.clone();
    const so = Math.sin(om);
    return a.clone().multiplyScalar(Math.sin((1 - t) * om) / so)
      .add(b.clone().multiplyScalar(Math.sin(t * om) / so));
  }
  
  function makeArc(A, B) {
    const R = CFG.radius;
    const sa = lonLatToVec3(A.lng, A.lat, R).normalize();
    const sb = lonLatToVec3(B.lng, B.lat, R).normalize();
    const ang = sa.angleTo(sb);
    const N = 64, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = slerpUnit(sa, sb, t);
      // 5 Nov 2026, Simon (close up the arcs looked flat, lying on the surface): short routes now rise more for their length (the extra fades out on long routes, so the world view is as it was)
      const h = R * (1 + ang * (CFG.arcHeight + 0.12 * Math.exp(-ang / 0.15)) * Math.sin(Math.PI * t)); // lift, peaks mid-route
      pts.push(u.multiplyScalar(h));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const TUB = 240, RAD = 8;   // 5 Nov 2026, Simon: arcs looked blocky close up (was 90 x 6); finer cut so the tube stays round and smooth as the camera closes in
    // custom tube: store centreline + unit radial offset, so a uniform can set thickness live
    const frames = curve.computeFrenetFrames(TUB, false);
    const pos = [], off = [], prog = [], idx = [];
    for (let i = 0; i <= TUB; i++) {
      const c = curve.getPointAt(i / TUB);
      const Nn = frames.normals[i], Bn = frames.binormals[i];
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * Math.PI * 2;
        const dir = Nn.clone().multiplyScalar(Math.cos(a)).addScaledVector(Bn, Math.sin(a));
        pos.push(c.x, c.y, c.z);
        off.push(dir.x, dir.y, dir.z);
        prog.push(i / TUB);
      }
    }
    for (let i = 0; i < TUB; i++) for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = a + RAD + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 3));
    geo.setAttribute('aProgress', new THREE.Float32BufferAttribute(prog, 1));
    geo.setIndex(idx);
  
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(CFG.arcColor), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const offset = Math.random() * 2.5;               // stagger each comet
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = ARC_T;
      sh.uniforms.uOffset = { value: offset };
      sh.uniforms.uThickness = ARC_TH;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aOffset;\nattribute float aProgress;\nuniform float uThickness;\nuniform float uTime;\nuniform float uOffset;\nvarying float vProgress;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat cpr = mod(uTime * 2.0 + uOffset, 2.5);\nfloat cst = clamp(cpr - 1.0, 0.0, 1.0);\nfloat cen = clamp(cpr, 0.0, 1.0);\nfloat cfr = clamp((aProgress - cst) / max(cen - cst, 1e-4), 0.0, 1.0);\nfloat taper = mix(0.12, 1.0, cfr * cfr);\ntransformed += aOffset * uThickness * taper;\nvProgress = aProgress;');   // 5 Nov 2026: a comet, not a ribbon: the tail tapers to a thread (Simon: no thicker head)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vProgress;\nuniform float uTime;\nuniform float uOffset;')
        .replace('#include <color_fragment>',
          '#include <color_fragment>\nfloat pr = mod(uTime * 2.0 + uOffset, 2.5);\nfloat st = clamp(pr - 1.0, 0.0, 1.0);\nfloat en = clamp(pr, 0.0, 1.0);\nif (vProgress < st || vProgress > en) discard;\nfloat frac = (vProgress - st) / max(en - st, 1e-4);\ndiffuseColor.a *= frac * frac;'); // bright head, fading tail (5 Nov 2026, Simon: the head stays orange, not white)
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }
  
  function addArcsAndEndpoints() {
    ROUTES.forEach(([a, b]) => {
      const arc = makeArc(a, b);
      globe.add(arc);
      worldFade.push({ mat: arc.material, base: 1, kind: 'arc' }); // all world arcs fade out on approach
    });
    // endpoint dots (unique)
    const uniq = new Map();
    ROUTES.forEach(r => r.forEach(p => uniq.set(p.lat + ',' + p.lng, p)));
    const arr = [...uniq.values()];
    const pos = new Float32Array(arr.length * 3);
    arr.forEach((p, i) => { const v = lonLatToVec3(p.lng, p.lat, CFG.radius * 1.004); pos[i*3]=v.x; pos[i*3+1]=v.y; pos[i*3+2]=v.z; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, endpointMat = new THREE.PointsMaterial({
      color: 0xffffff, size: CFG.endpointSize, map: STAR,   // (5 Nov 2026: the star picture carries the colour; was CFG.endpointColor on the soft dot)
      sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    pts.frustumCulled = false;
    globe.add(pts);
    worldFade.push({ mat: pts.material, base: 1, kind: 'arc' }); // endpoint dots fade with the world
  
    // name label per endpoint (CSS2D), hidden on the far side
    arr.forEach(p => {
      if (!p.name) return;
      const at = lonLatToVec3(p.lng, p.lat, CFG.radius * 1.02);
      const el = document.createElement('div');
      el.className = 'pinlabel' + (p === CI ? ' pinci' : '');
      const span = document.createElement('span');
      span.textContent = p.name;
      el.appendChild(span);
      const obj = new CSS2DObject(el);
      obj.position.copy(at);
      globe.add(obj);
      labelObjs.push({ el, normal: at.clone().normalize() });
    });
  }

  /* ---------- global shipping-lane network (Voyage Planner Phase 1, 16 Sep 2026; restyled per Simon's feedback) ----------
     A persistent, quiet backdrop of real trunk shipping routes, visible at every zoom — deliberately not another
     comet (a fleet doesn't need two kinds of moving light; this one just sits there, like a chart). Hand-curated
     waypoints through real chokepoints (Gibraltar, Suez, Bab-el-Mandeb, Hormuz, Malacca, Panama, the Cape) — good
     enough for "she really did sail here", not navigation-grade. Every lane joins the same Channel approach spine
     (Ushant TSS -> mid-Channel -> Casquets TSS) plus a north-easterly continuation up-Channel to the North Sea
     (Dover Strait -> Rotterdam/Hamburg, and a separate fork to Norway) — Ushant/Casquets/Dover were the only
     points shown before this; now they're just this network's own waypoints. Drawn as a soft orange "spray" of
     point-sprites (the same SPRITE/makePoints the dot-matrix globe itself uses), not a crisp line — Simon, 16 Sep:
     "like the orange spray stripes in the channel at zoomed in level" (the AIS density heatmap's own look). The
     routing server (Phase 4) works the same way for a real selected ship: join the nearest lane, follow it in. */
  const CHANNEL_APPROACH = [[48.55, -5.50], [49.90, -3.10], [50.00, -2.75]];   // Ushant TSS -> mid-Channel -> Casquets TSS
  const DOVER = [50.90, 1.40];
  // Gibraltar -> offshore Portugal -> round Cape Finisterre -> Biscay. NOT a straight Gibraltar->Ushant line — checked against
  // real coastlines after Simon flagged land-crossings, 16 Sep 2026: a direct line there cuts straight across Iberia.
  const GIBRALTAR_APPROACH = [[35.95, -5.55], [37.0, -9.8], [42.5, -10.3], [45.5, -6.5]];
  const SHIP_LANES = [
    { name: 'North Atlantic',     major: true,  pts: [[40.71, -74.01], [42.0, -50.0], [45.5, -25.0], [47.5, -9.5], ...CHANNEL_APPROACH] },
    { name: 'South Atlantic',     major: true,  pts: [[-33.92, 18.42], [-15.0, 0.0], [5.0, -15.0], [20.0, -19.0], [29.0, -13.5], ...GIBRALTAR_APPROACH, ...CHANNEL_APPROACH] },
    { name: 'Asia / Suez',        major: true,  pts: [
        [1.29, 103.85], [2.5, 100.8], [5.0, 98.5], [6.0, 94.5],    // Malacca Strait — hugs the strait, not a straight Singapore cut across Sumatra
        [8.0, 80.0], [11.0, 60.0], [13.5, 50.5],                    // Indian Ocean / Arabian Sea, cleared of the Horn of Africa
        [12.6, 43.3],                                               // Bab-el-Mandeb
        [17.5, 39.5], [24.5, 35.5],                                 // Red Sea, on its centre line
        [29.93, 32.55], [31.26, 32.30],                             // Suez
        [33.0, 28.0], [35.5, 20.0], [36.3, 12.0],                   // East/Central Med, Sicily Channel (south of Sicily/Tunisia)
        ...GIBRALTAR_APPROACH, ...CHANNEL_APPROACH
      ] },
    { name: 'Gulf',                major: false, pts: [[26.57, 56.25], [13.5, 50.5]] },   // Hormuz -> spur joining Asia/Suez's Gulf of Aden approach waypoint
    { name: 'Panama / Caribbean', major: true,  pts: [[9.35, -79.90], [15.5, -74.0], [28.0, -50.0], [40.0, -30.0], [46.0, -15.0], ...CHANNEL_APPROACH] },
    { name: 'Australia',          major: false, pts: [[-32.05, 115.75], [-15.0, 95.0], [8.0, 80.0]] },   // spur — joins Asia/Suez's Indian Ocean waypoint
    { name: 'South America',      major: true,  pts: [[-24.0, -46.3], [-10.0, -25.0], [15.0, -30.0], [35.0, -20.0], [44.0, -12.0], ...CHANNEL_APPROACH] },
    // Casquets -> Dover -> Rotterdam -> offshore North Sea -> German Bight -> Hamburg. Previously a straight Rotterdam->Hamburg
    // line that cut across the Netherlands/Germany — now stays offshore round the coast, same fix as Gibraltar->Ushant above.
    // 18 Sep 2026, Simon: "after they go up to Amsterdam, Germany etc, continue up to Oslo" — extended past Hamburg,
    // staying offshore WEST of Denmark's Jutland peninsula (a direct Hamburg->Skagerrak line cuts straight across
    // it) to the same Skagerrak-entrance waypoint the Norway lane below already uses — the shared literal [56.0,5.5]
    // is what actually joins the two lanes into one graph node, same technique as every other lane join here.
    { name: 'North Sea',          major: true,  pts: [[50.00, -2.75], DOVER, [51.95, 4.14], [53.5, 4.7], [54.0, 7.5], [53.55, 9.99], [56.0, 5.5]] },
    // Dover -> mid-Skagerrak -> clear of Norway's SW coast -> Oslofjord -> Oslo. Previously cut close enough to
    // Kristiansand to clip it — bowed further out into the strait.
    { name: 'Norway',             major: false, pts: [DOVER, [56.0, 5.5], [58.3, 7.0], [59.3, 10.3], [59.91, 10.75]] },
    // 18 Sep 2026, Simon: "...continue up to Oslo etc which should then also close that loop up to Greenland" — a
    // separate spur off the Skagerrak entrance (Norway's own [58.3,7.0], not chained after Oslo — routing Bergen via
    // Oslofjord and back out would be a real detour, ~340nm longer than sailing there directly) up the west coast to
    // Bergen. [60.4,5.3] is the exact literal Nordic — North Atlantic (below) starts with, so this is what actually
    // closes the loop: Channel -> North Sea -> Norway -> Bergen -> Nordic's own chain -> Faroes -> Iceland -> Greenland.
    { name: 'Norway — Bergen',    major: false, pts: [[58.3, 7.0], [60.4, 5.3]] },
    // additions, 16 Sep 2026 (Simon: "cape town eastwards, panama canal westwards, maybe a few more") — each checked
    // the same way as the fixes above: real port/chokepoint coordinates, bowed generously clear of any coast nearby.
    { name: 'Cape Route',         major: true,  pts: [[-33.92, 18.42], [-32.0, 28.0], [-25.0, 45.0], [-15.0, 60.0], [8.0, 80.0]] },   // Cape Town east, round south of Madagascar, joins Asia/Suez's Indian Ocean waypoint — the real Cape alternative to Suez
    { name: 'Panama — US West Coast', major: true, pts: [[8.95, -79.57], [8.0, -84.0], [11.5, -93.0], [17.0, -107.0], [24.0, -114.0], [30.0, -119.0], [33.7, -118.2]] },   // Panama's Pacific side (Balboa) up the Central America/Mexico/Baja coast to Los Angeles
    { name: 'China',              major: true,  pts: [[31.23, 121.47], [28.0, 124.0], [18.0, 118.0], [12.0, 112.0], [1.29, 103.85]] },   // Shanghai, offshore past Taiwan and the Philippines/Vietnam, down to Singapore — joins Asia/Suez there
    { name: 'India',              major: false, pts: [[18.94, 72.84], [13.5, 50.5]] },   // Mumbai -> spur joining Asia/Suez's Gulf of Aden approach waypoint
    // additions, 16 Sep 2026 (Simon: is it true to reality there's not much Asia/Australia -> the Americas traffic
    // heading east? No — trans-Pacific, especially China <-> US West Coast, is one of the busiest lanes in the world;
    // the network only had routes that plausibly head toward the Channel, so this whole side of the map was missing.
    { name: 'Trans-Pacific',      major: true,  pts: [[31.23, 121.47], [22.0, 138.0], [25.0, 175.0], [30.0, -150.0], [33.7, -118.2]] },   // Shanghai, south of the Ryukyus/Japan, across the open North Pacific to Los Angeles — joins China and Panama/US West Coast at their shared endpoints
    { name: 'Canada',             major: false, pts: [[30.0, -150.0], [38.0, -135.0], [49.28, -123.12]] },   // spur off the trans-Pacific route to Vancouver
    { name: 'Australia — Pacific', major: true, pts: [[-33.87, 151.21], [-28.0, 175.0], [-22.0, -165.0], [-10.0, -115.0], [-2.0, -95.0], [8.95, -79.57]] },   // Sydney, south of Fiji/New Caledonia, across the South Pacific to Panama — Australia's Pacific-facing trade, distinct from the Fremantle/Indian Ocean lane above
    { name: 'South America — Pacific', major: false, pts: [[-22.0, -165.0], [-24.0, -120.0], [-33.0, -90.0], [-33.0, -71.6]] },   // spur off the Australia-Pacific route, clear of Easter Island, to Valparaíso — the real Asia/Australia <-> Chile-Peru copper trade
    // Simon, 16 Sep 2026: thinking ahead to Phase 4 — a ship sitting up near Iceland or west of Scotland right now has
    // no nearby lane to join. This whole North Atlantic/Arctic region was empty; fills it in and closes the loop.
    { name: 'Nordic — North Atlantic', major: true, pts: [[60.4, 5.3], [63.0, -6.0], [64.15, -21.9], [59.5, -43.0], [47.56, -52.71], [45.5, -25.0]] },   // Bergen, north of the Faroes, Iceland, round Cape Farewell (Greenland), Newfoundland, joins the North Atlantic lane at its mid-ocean waypoint
    { name: 'UK West Coast',          major: false, pts: [[64.15, -21.9], [59.0, -10.0], [51.5, -12.5], [48.55, -5.50]] },   // Iceland south, west of the Hebrides/Ireland, into Ushant — closes the loop back into the Channel network directly, not just via Greenland/Newfoundland
    // 18 Sep 2026, Simon: testing a Monaco-area ship (Ocean Dreamwalker III) sent her straight north-west across the
    // French mainland toward the Dover approach — the network had no Western Med lane at all, so the nearest-lane
    // search's raw (land-agnostic) distance picked the North Sea lane's Casquets->Dover segment as numerically
    // closer than any real sea route, with nothing nearby to catch her first. Riviera/Genoa -> off Marseille -> Palma
    // (Simon's own suggestion) -> clear south of the Balearics -> Costa del Sol -> Gibraltar, joining GIBRALTAR_APPROACH
    // there (same graph node South Atlantic/Asia-Suez already use) so distToCasquets flows through automatically.
    { name: 'Western Mediterranean',  major: true,  pts: [[44.40, 8.90], [43.30, 5.35], [39.57, 2.65], [37.80, 1.00], [36.20, -3.60], ...GIBRALTAR_APPROACH] },
    // 18 Sep 2026, Simon: "one from Greenland going down to landsend gateway" — a more direct alternative to the
    // existing Greenland->Newfoundland->mid-ocean detour (Nordic — North Atlantic, above) for a ship already this
    // far down, bowed clear of Ireland's south-west coast. Ends at Ushant, same as UK West Coast above, NOT at the
    // Land's End gateway waypoint itself (VOYAGE_ROUTE_LEADINS.north, further down) — that point only exists as a
    // lead-in for the final approach, not a real lane node, so ending the lane there would leave it with no path to
    // Casquets in the graph (an unreachable dead end) and make it invisible to the routing/cost search entirely.
    // Ending at Ushant instead makes this lane behave exactly like UK West Coast already does — same lane-name
    // check in planVoyageRoute's viaNorth classifies a ship nearest this lane into the Land's End gateway corridor.
    { name: "Greenland — Land's End", major: true,  pts: [[59.5, -43.0], [54.0, -24.0], [48.55, -5.50]] },
  ];
  const laneFades = [];   // one {mat, base} per strand — each pushed into worldFade individually, so the existing generic opacity pass handles all of them for free
  function buildShipLanes() {
    // restyled a third time, 16 Sep 2026 — Simon: closer to the second reference image specifically — "whispy, hairlike,
    // not dotted but still with that varying brightness". Moved off point-sprites entirely: each lane is now several (4)
    // thin THREE.Line strands, each offset a SMOOTH, CONSTANT sideways amount (not per-point jitter, which read as dotted/
    // grainy) — every strand is one coherent thread, and a handful of them together read as a loosely bundled hair rather
    // than a single ruled line. Brightness varies per strand (randomised around the major/minor base) as well as between
    // the two tiers, echoing the reference images' unevenness without their multi-colour palette.
    const r = CFG.radius * 1.0012;
    const HOP = 48, STRANDS = 4, SPREAD = 0.0032;
    const UPv = new THREE.Vector3(0, 1, 0), ALTv = new THREE.Vector3(1, 0, 0);
    // 18 Sep 2026, Simon: the network reads as too busy/prominent as a constant backdrop — dimmed right down by
    // default (DIM_SCALE), just a hint that it's there; a route in progress brightens back up to the original
    // level (brightBase below matches the old laneBase values exactly), but only the EXACT edge(s) she actually
    // rides — not whole lanes. Several trunk lanes share their literal final stretch into Casquets (built from the
    // same CHANNEL_APPROACH constant), so highlighting by lane would light up South Atlantic/Asia-Suez/Panama's
    // entire length for a route that only ever touches their shared tail — one Three.Line per EDGE (not per lane)
    // instead, each independently dimmable, tagged with the same edge key planVoyageRoute() reports back
    // (voyageRoute.usedEdges) so only geometry she's truly on ever brightens.
    const DIM_SCALE = 0.2;
    SHIP_LANES.forEach(lane => {
      const laneBright = lane.major ? 0.22 : 0.11;
      for (let s = 0; s < STRANDS; s++) {
        const off = (s - (STRANDS - 1) / 2) / ((STRANDS - 1) / 2) * SPREAD + (Math.random() - 0.5) * SPREAD * 0.4;   // fanned out across the bundle, not stacked on the centreline, plus a little randomness so it's not a neat comb
        const variance = 0.55 + Math.random() * 0.75;   // per-strand brightness variance — some threads catch the light more than others, kept the same in both dim and bright states, and the same across a strand's own edges so it still reads as one coherent thread
        for (let i = 0; i < lane.pts.length - 1; i++) {
          const a = lonLatToVec3(lane.pts[i][1], lane.pts[i][0], 1).normalize();
          const b = lonLatToVec3(lane.pts[i + 1][1], lane.pts[i + 1][0], 1).normalize();
          const verts = [];
          for (let j = 0; j <= HOP; j++) {
            const base = slerpUnit(a, b, j / HOP);
            const up = Math.abs(base.y) < 0.98 ? UPv : ALTv;
            const tx = up.clone().cross(base).normalize();
            verts.push(base.clone().addScaledVector(tx, off).normalize().multiplyScalar(r));
          }
          const geo = new THREE.BufferGeometry().setFromPoints(verts);
          const mat = new THREE.LineBasicMaterial({ color: 0xFF3EA5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
          const line = new THREE.Line(geo, mat); line.frustumCulled = false; line.renderOrder = 1;
          globe.add(line);
          const edgeKey = edgeLaneKey(llKey(lane.pts[i]), llKey(lane.pts[i + 1]));
          const fade = { mat, base: laneBright * variance * DIM_SCALE, brightBase: laneBright * variance, laneName: lane.name, edgeKey, hl: 0 };
          laneFades.push(fade); worldFade.push(fade);   // no `kind:'arc'` — stays visible through the deep zoom, unlike the comet arcs
        }
      }
    });
  }

  /* ---------- Voyage Planner Phase 4: the lane network as a graph ----------
     SHIP_LANES already IS a de-facto graph — lanes share exact coordinate values wherever they're meant to "join"
     (named consts like CHANNEL_APPROACH/DOVER, or plain duplicate literals, e.g. Cape Town shared by South
     Atlantic/Cape Route) — so nodes are just coordinate values, no separate node list to author. Every lane
     eventually reaches the same single point (Casquets, the end of CHANNEL_APPROACH), so there's only ever one
     real destination to route to: one Dijkstra from Casquets, run once here, gives every node's shortest
     graph-distance back to it — reused for every future "Change Destination: Jersey" click, not recomputed per click. */
  const NM_PER_RAD = 3440.065;
  const llKey = ll => ll[0].toFixed(4) + ',' + ll[1].toFixed(4);   // node identity by coordinate value — exactly how the lanes already "join"
  const laneGraph = new Map();   // key -> { ll:[lat,lng], edges:[{to:key, nm}] }
  function laneGraphNode(ll) { const k = llKey(ll); let n = laneGraph.get(k); if (!n) { n = { ll, edges: [] }; laneGraph.set(k, n); } return n; }
  // 18 Sep 2026: a stable identity for an edge regardless of which end you name first — used both to tag each
  // visual lane-strand segment (buildShipLanes(), one Three.Line per edge now, not per whole lane) and to record
  // exactly which edges a computed route rides (planVoyageRoute()'s usedEdges) — matched by key, so only the
  // precise geometry she's actually on brightens (tick()), not an entire lane that merely shares a stretch with her.
  const edgeLaneKey = (ka, kb) => ka < kb ? ka + '|' + kb : kb + '|' + ka;
  function laneGraphEdge(a, b) {
    const na = laneGraphNode(a), nb = laneGraphNode(b);
    const nm = kinHaversineNm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
    na.edges.push({ to: llKey(b), nm }); nb.edges.push({ to: llKey(a), nm });
  }
  SHIP_LANES.forEach(lane => { for (let i = 0; i + 1 < lane.pts.length; i++) laneGraphEdge(lane.pts[i], lane.pts[i + 1]); });
  const CASQUETS_KEY = llKey(CHANNEL_APPROACH[CHANNEL_APPROACH.length - 1]);
  const distToCasquets = new Map(), prevToCasquets = new Map();
  (function dijkstraFromCasquets() {
    const visited = new Set(); distToCasquets.set(CASQUETS_KEY, 0);
    const queue = [[0, CASQUETS_KEY]];
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]); const [d, k] = queue.shift();
      if (visited.has(k)) continue; visited.add(k);
      const node = laneGraph.get(k); if (!node) continue;
      for (const e of node.edges) {
        const nd = d + e.nm;
        if (nd < (distToCasquets.get(e.to) ?? Infinity)) { distToCasquets.set(e.to, nd); prevToCasquets.set(e.to, k); queue.push([nd, e.to]); }
      }
    }
  })();
  function laneGraphPathToCasquets(startKey) {   // [{key, ll:[lat,lng]}, ...] from startKey through to Casquets, walking the Dijkstra tree back toward its root
    const path = []; let k = startKey, guard = 0;
    while (k && k !== CASQUETS_KEY && guard++ < 500) { path.push(k); k = prevToCasquets.get(k); }
    if (k === CASQUETS_KEY) path.push(CASQUETS_KEY);
    return path.map(kk => ({ key: kk, ll: laneGraph.get(kk).ll }));
  }
  // spherical cross-track distance from point P to the great-circle segment A->B, clamped to the segment's own
  // extent (beyond either end measures straight to that end instead) — standard navigation formula, good enough
  // for "join the nearest lane", same "not navigation-grade" spirit as the lane waypoints themselves.
  function nearestOnSegment(P, A, B) {
    const rad = d => d * Math.PI / 180;
    const dAB = kinHaversineNm({ lat: A[0], lng: A[1] }, { lat: B[0], lng: B[1] }) / NM_PER_RAD;
    if (dAB < 1e-9) return { nm: kinHaversineNm({ lat: P[0], lng: P[1] }, { lat: A[0], lng: A[1] }), t: 0 };
    const dAP = kinHaversineNm({ lat: A[0], lng: A[1] }, { lat: P[0], lng: P[1] }) / NM_PER_RAD;
    const φA = rad(A[0]), λA = rad(A[1]), φB = rad(B[0]), λB = rad(B[1]), φP = rad(P[0]), λP = rad(P[1]);
    const brgAB = Math.atan2(Math.sin(λB - λA) * Math.cos(φB), Math.cos(φA) * Math.sin(φB) - Math.sin(φA) * Math.cos(φB) * Math.cos(λB - λA));
    const brgAP = Math.atan2(Math.sin(λP - λA) * Math.cos(φP), Math.cos(φA) * Math.sin(φP) - Math.sin(φA) * Math.cos(φP) * Math.cos(λP - λA));
    const xtd = Math.asin(Math.max(-1, Math.min(1, Math.sin(dAP) * Math.sin(brgAP - brgAB))));
    let atd = Math.acos(Math.max(-1, Math.min(1, Math.cos(dAP) / Math.cos(xtd)))); if (!isFinite(atd)) atd = 0;
    // 19 Sep 2026: acos() is always >= 0, so a point BEHIND the segment's start (along the extended great circle)
    // was treated as being that same distance AHEAD of it — reporting only its small cross-track distance to a
    // foot point that doesn't exist (a ship 850nm behind a segment's start read as 268nm from it). Sign it by
    // whether her bearing from A is on the segment's side; behind => atd<0 => clamped to A below.
    if (Math.cos(brgAP - brgAB) < 0) atd = -atd;
    const t = Math.max(0, Math.min(1, atd / dAB));
    if (t <= 0) return { nm: kinHaversineNm({ lat: P[0], lng: P[1] }, { lat: A[0], lng: A[1] }), t: 0 };
    if (t >= 1) return { nm: kinHaversineNm({ lat: P[0], lng: P[1] }, { lat: B[0], lng: B[1] }), t: 1 };
    return { nm: Math.abs(xtd) * NM_PER_RAD, t };
  }
  // 18 Sep 2026, Simon: a Monaco-area ship's nearest-lane search picked the North Sea lane's Casquets->Dover
  // segment — numerically the closest, but only by cutting straight across France, since the raw crosstrack
  // distance nearestOnSegment() computes has no idea land is in the way. That's fine everywhere the network is
  // genuinely open ocean (the "join" leg to any lane is always plausible sea travel there), but the Mediterranean
  // is an enclosed sea with exactly one real way out (Gibraltar) — so a ship inside it can end up numerically
  // closer to a lane on the OTHER side of Europe than to any real sea route out. Gate it: once a ship is detected
  // inside this crude Med bounding box (good enough, same spirit as the rest of this hand-curated network), only
  // segments with BOTH endpoints also inside it are eligible — NOT "at least one", which still let her join, say,
  // Gibraltar's own next segment onward toward Portugal (one endpoint just outside the box) via a straight line
  // that cuts across Spain to reach it. Both-inside means the segment ending AT Gibraltar itself is still a valid
  // candidate (both its points sit inside the box) — she just can't skip straight past it to whatever's beyond.
  function inMedReach(pt) { return pt[0] > 30 && pt[0] < 46 && pt[1] > -6 && pt[1] < 36.5; }
  function inMediterranean(lat, lng) { return inMedReach([lat, lng]); }
  // 19 Sep 2026, Simon: same class of bug for ships in the Red Sea, Gulf of Suez and Persian Gulf — the search could
  // pick a Dover/Casquets segment and draw a straight line to it across Arabia/Africa/Europe. These are enclosed
  // seas with one way out, so a ship inside is restricted to the lane that actually runs through/out of it (the
  // Red Sea/Suez chain of Asia / Suez; the Gulf spur), and the graph path takes her out from there.
  const inRedSea = pt => pt[0] > 12 && pt[0] < 32 && pt[1] > 32 && pt[1] < 45;
  const inPersianGulf = pt => pt[0] > 23 && pt[0] < 31 && pt[1] > 47 && pt[1] < 57.5;
  function enclosedSeaAllows(lat, lng, lane, A, B) {
    const pt = [lat, lng];
    if (inRedSea(pt)) return lane.name === 'Asia / Suez' && inRedSea(A) && inRedSea(B);
    if (inPersianGulf(pt)) return lane.name === 'Gulf';
    return true;
  }
  // 18 Sep 2026, Simon: found testing an Iceland-area ship after the along-track fix above — mid-Channel and
  // Casquets sit BETWEEN the network's two real gateways (Ushant from the west/south, Dover from the north/east),
  // never reachable directly from outside except by passing through one of those first. A ship far enough north can
  // find a straight line to one of these that's numerically SHORTER than reaching Ushant itself, even though that
  // line cuts straight across the British Isles — same class of bug as the Mediterranean fix above, just not caught
  // until the along-track correction started properly costing the real distance along UK West Coast's own lane
  // (previously under-counted, which accidentally made the legitimate lane win by looking cheaper than it really was).
  // 19 Sep 2026, Simon: Executioner (starting right ON the Nordic lane off Newfoundland) "jumps between two lanes
  // halfway across the Atlantic when staying on the original would probably be a better route", and the lane
  // highlighting looked wrong for her — the search picked a ~980nm straight OFF-lane hop across open ocean to join
  // Panama/Caribbean mid-way, because raw distance made that chord a little shorter than following the lane she was
  // already on (~200nm). Off-lane travel (the cross-track "join" leg) now counts 1.5x, so a ship already near a
  // lane follows it — the point of the network — unless a genuinely much closer lane exists. Only the join leg is
  // weighted; distance ALONG lanes is unchanged.
  const OFF_LANE_WEIGHT = 1.5;
  function isInternalChannelPoint(pt) { return (pt[0] === 49.90 && pt[1] === -3.10) || (pt[0] === 50.00 && pt[1] === -2.75); }
  function nearChannel(lat, lng) { return lat > 46 && lat < 52 && lng > -7 && lng < 4; }
  // 19 Sep 2026, Simon: on the Dover corridor "the turn south is ok, but then when they turn to head east at the
  // merge point it's like a 90 degree snap rather than a realistic turn" — every leg (ocean-transit, lead-in) is
  // built from straight great-circle hops concatenated end to end, so direction is continuous WITHIN each leg but
  // genuinely kinks at every leg boundary; most of those are gentle/small and go unnoticed, but the merge itself —
  // straight from the lead-in's last waypoint onto Kinship's own tail (kin.pts), an entirely separate hand-authored
  // curve with its own tangent — can be a sharp one, right where the sprite's largest (closest zoom) and most
  // noticeable. Bridges it with a cubic Hermite curve (tangent-matched at both ends, so direction is continuous
  // through the join, not just position) rather than a straight jump — standard technique for blending two curves
  // that don't otherwise share a tangent; the sphere's curvature over a span this short (a few tens of nm at most)
  // is negligible, so plain 3D Hermite + renormalize is indistinguishable from a "proper" spherical version.
  function hermiteBridge(P0, T0dir, P1, T1dir, n) {
    const dist = P0.distanceTo(P1);
    if (dist < 1e-6) return [];
    const T0 = T0dir.clone().normalize().multiplyScalar(dist), T1 = T1dir.clone().normalize().multiplyScalar(dist);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push(P0.clone().multiplyScalar(h00).addScaledVector(T0, h10).addScaledVector(P1, h01).addScaledVector(T1, h11).normalize());
    }
    return out;
  }
  // the whole route: straight line to the nearest lane, the graph's own shortest path from there to Casquets, the
  // arrival corridor's lead-in, then Kinship's own track from the merge point on — see VOYAGE_ROUTE_LEADINS above.
  function planVoyageRoute(shipLat, shipLng) {
    const gated = inMediterranean(shipLat, shipLng);
    const chanOk = nearChannel(shipLat, shipLng);
    let best = null;
    SHIP_LANES.forEach(lane => {
      for (let i = 0; i + 1 < lane.pts.length; i++) {
        const A = lane.pts[i], B = lane.pts[i + 1];
        if (gated && !(inMedReach(A) && inMedReach(B))) continue;
        if (!enclosedSeaAllows(shipLat, shipLng, lane, A, B)) continue;
        const { nm, t } = nearestOnSegment([shipLat, shipLng], A, B);
        if (!chanOk && (t <= 0 || t >= 1) && isInternalChannelPoint(t <= 0 ? A : B)) continue;
        const dA = distToCasquets.get(llKey(A)) ?? Infinity, dB = distToCasquets.get(llKey(B)) ?? Infinity;
        // cost via each endpoint also has to include the distance ALONG this segment from the join point to reach
        // it — not just that endpoint's own distance to Casquets. Missing this made a long segment joined partway
        // along (e.g. Asia/Suez's Sicily->Gibraltar chord, joined mid-Mediterranean) look artificially cheap: only
        // the short perpendicular hop to the line was counted, not the hundreds of nm still left to travel along it.
        const segNm = kinHaversineNm({ lat: A[0], lng: A[1] }, { lat: B[0], lng: B[1] });
        const costA = t * segNm + dA, costB = (1 - t) * segNm + dB;
        const viaKey = costA <= costB ? llKey(A) : llKey(B), total = nm * OFF_LANE_WEIGHT + Math.min(costA, costB);
        if (!best || total < best.total) best = { total, A, B, t, viaKey, laneName: lane.name, segNm };
      }
    });
    if (!best) return null;
    const av = lonLatToVec3(best.A[1], best.A[0], 1).normalize(), bv = lonLatToVec3(best.B[1], best.B[0], 1).normalize();
    const joinVec = slerpUnit(av, bv, best.t);
    const shipVec = lonLatToVec3(shipLng, shipLat, 1).normalize();
    let graphPath = laneGraphPathToCasquets(best.viaKey);
    const viaDover = graphPath.some(({ ll: [la, lo] }) => Math.abs(la - DOVER[0]) < 0.01 && Math.abs(lo - DOVER[1]) < 0.01);
    // north = she's nearest to the UK West Coast lane (Iceland/Faroes down to Ushant, i.e. "between UK and Ireland
    // or further north"), the new Greenland — Land's End lane (18 Sep 2026), or Nordic's own northern leg (Bergen/
    // Faroes/Iceland/Greenland) — but NOT Nordic's shared tail segment into [45.5,-25.0], which is also North
    // Atlantic's own mid-ocean waypoint: a ship nearest there (e.g. off Newfoundland) reads as a plain west/Atlantic
    // crossing, not a "from the north" approach.
    const viaNorth = !viaDover && (best.laneName === 'UK West Coast' || best.laneName === "Greenland — Land's End" || (best.laneName === 'Nordic — North Atlantic' && best.viaKey !== llKey([45.5, -25.0])));
    // she peels off the lane for the Land's End gateway instead of continuing on to Ushant/Casquets — the graph path
    // to Casquets doesn't apply to this corridor at all, her lead-in picks up straight from wherever she joins.
    // 19 Sep 2026: used to drop the graph path ENTIRELY here — after joining she cut straight across open ocean to
    // the gateway, ignoring the very lane she'd joined (and only the join segment lit up). Now follows the lane on
    // as far as the last node BEFORE Ushant, and only then peels off for the gateway.
    if (viaNorth) {
      const ushantIdx = graphPath.findIndex(n => n.key === llKey(CHANNEL_APPROACH[0]));
      graphPath = ushantIdx >= 0 ? graphPath.slice(0, ushantIdx) : graphPath.slice(0, -1);
    }
    // Dover connects straight to Casquets with no node between (graphPath's own last entry is always Casquets) —
    // drop it, since the refined Dover lead-in turns south at lon -1.5, well short of Casquets, and no longer visits
    // it at all; leaving it in made her run past Casquets then double back northeast to reach the Turn waypoint.
    if (viaDover) graphPath = graphPath.slice(0, -1);
    // 19 Sep 2026, Simon: tested a Western Mediterranean/Biscay ship (Ocean Dreamwalker) and her final approach
    // "goes way north up to Guernsey and then diverts down" instead of staying on Kinship's own path — the west
    // corridor's graph path always runs the CHANNEL_APPROACH spine all the way to Casquets (a real TSS point north
    // of Guernsey), then jumps south-west to the merge point near Jersey, a genuine out-and-back detour for any ship
    // arriving via Ushant. Kinship's own tail already handles "Ushant to Jersey" realistically, so — same peel-off
    // pattern as north/Dover above — drop the trailing mid-Channel/Casquets leg and hand off from Ushant itself.
    // Only applies when Ushant is actually in the path (a ship already close to Casquets/mid-Channel has no real
    // detour to cut, so she keeps going there as before).
    if (!viaDover && !viaNorth) {
      const ushantIdx = graphPath.findIndex(n => n.key === llKey(CHANNEL_APPROACH[0]));
      if (ushantIdx >= 0) graphPath = graphPath.slice(0, ushantIdx + 1);
    }
    const graphVecs = graphPath.map(({ ll: [la, lo] }) => lonLatToVec3(lo, la, 1).normalize());
    const corridor = VOYAGE_ROUTE_LEADINS[viaDover ? 'dover' : viaNorth ? 'north' : 'west'];
    const leadInVecs = corridor.waypoints.map(([la, lo]) => lonLatToVec3(lo, la, 1).normalize());
    const tailVecs = (kin && kin.pts) ? kin.pts.slice(corridor.mergeIndex) : [];
    const legs = [shipVec, joinVec, ...graphVecs, ...leadInVecs];
    const HOP = 24, sampled = [];
    for (let i = 0; i + 1 < legs.length; i++) {
      const a = legs[i], b = legs[i + 1];
      for (let j = (i === 0 ? 0 : 1); j <= HOP; j++) sampled.push(slerpUnit(a, b, j / HOP));
    }
    // bridge the merge splice with a tangent-matched curve (hermiteBridge, above) instead of jumping straight from
    // the lead-in's last sample onto kin.pts' own first one — needs at least a few points on each side to derive a
    // real tangent from (falls back to a plain join for a pathologically short tail, which shouldn't happen in
    // practice since every corridor's mergeIndex leaves well over a hundred kin.pts points).
    const BRIDGE_N = 16, TAN_SPAN = 4;
    let pts;
    if (sampled.length > TAN_SPAN && tailVecs.length > TAN_SPAN) {
      const P0 = sampled[sampled.length - 1], T0dir = P0.clone().sub(sampled[sampled.length - 1 - TAN_SPAN]);
      const P1 = tailVecs[0], T1dir = tailVecs[TAN_SPAN].clone().sub(P1);
      const bridge = hermiteBridge(P0, T0dir, P1, T1dir, BRIDGE_N);
      pts = sampled.concat(bridge, tailVecs);
    } else {
      pts = sampled.concat(tailVecs);
    }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i - 1].angleTo(pts[i]) * NM_PER_RAD);
    // 18 Sep 2026, Simon: the lane network is dimmed by default (buildShipLanes(), below) — only the EXACT edge(s)
    // she actually rides brighten back up (tick()), not whole lanes that merely share a stretch with her (several
    // major lanes share their literal final approach into Casquets, built from the same CHANNEL_APPROACH constant,
    // so a lane-level highlight would've lit South Atlantic/Asia-Suez/Panama's full length for a route that only
    // ever touches their shared tail). The join segment (best.A->best.B) plus every edge the graph path actually
    // walks, matched by the same key buildShipLanes() tags each per-edge strand with.
    // the join segment only lights if she actually rides some of it — joining right at one of its endpoints (t at 0
    // or 1, heading on from there) doesn't travel it, so it shouldn't brighten (19 Sep 2026)
    const usedEdges = new Set();
    if ((best.viaKey === llKey(best.B) ? (1 - best.t) : best.t) * best.segNm > 1) usedEdges.add(edgeLaneKey(llKey(best.A), llKey(best.B)));
    for (let i = 0; i + 1 < graphPath.length; i++) usedEdges.add(edgeLaneKey(graphPath[i].key, graphPath[i + 1].key));
    return { pts, cum, total: cum[cum.length - 1], usedEdges, tailStart: cum[Math.min(cum.length - 1, pts.length - tailVecs.length)] };
  }
  // "Change Destination: Jersey" (live.js's renderCallout(), the .ltake button) — passed into initLive() as
  // onChangeDestination, below. snapshot is a one-time read of the real ship at the moment of the click; from here
  // she's on this scripted route, not the live feed (live.js's own routeMode flag stops it fighting this rendering).
  function onChangeDestination(snapshot) {
    const route = planVoyageRoute(snapshot.lat, snapshot.lng);
    if (!route) { console.warn('[globe-live] could not plan a voyage route for', snapshot); live?.setRouteMode?.(false); return null; }
    resetVoyageExample(); resetVoyageMonitor();
    voyageRoute = route;
    armVoyageRouteCallout(snapshot);
    if (window.scrollY > 0) window.scrollTo(0, 0);
    voyageUnlockScroll();
    voyageRouteMode = true;
    return { totalNm: route.total };   // 18 Sep 2026: live.js types this into the still-visible card before her journey starts — see the .ltake click handler
  }

  // invisible sphere that writes depth, so back-of-globe arcs/dots are occluded
  function addOceanLabel() {
    const at = lonLatToVec3(-38, 30, CFG.radius * 1.02);
    const el = document.createElement('div');
    el.className = 'pinlabel oceanlabel';
    const span = document.createElement('span');
    span.textContent = 'The Atlantic Ocean';
    el.appendChild(span);
    const obj = new CSS2DObject(el);
    obj.position.copy(at);
    globe.add(obj);
    labelObjs.push({ el, normal: at.clone().normalize() });
  }

  function addTownLabels() {
    // the towns carry the orange dot (the islands were one orange dot on the globe; here each town is one) — a fixed screen-size
    // dot with a soft halo, so it reads the same at every zoom; Jersey Airport gets a larger, softer blob (Howard, 16 Sep 2026)
    [['St Helier', -2.1045, 49.1869, 'town'], ['St Peter Port', -2.536, 49.458, 'town'], ['St Anne', -2.205, 49.715, 'town'], ['Jersey Airport', -2.195, 49.208, 'airport']].forEach(([name, lng, lat, kind]) => {
      const at = lonLatToVec3(lng, lat, CFG.radius * 1.002); const el = document.createElement('div'); el.className = 'pinlabel pintown pin-' + kind;
      const dot = document.createElement('i'); dot.className = 'pindot'; el.appendChild(dot); const sp = document.createElement('span'); sp.textContent = name; el.appendChild(sp);
      const obj = new CSS2DObject(el); obj.position.copy(at); globe.add(obj); labelObjs.push({ el, normal: at.clone().normalize(), late: true }); });
  }
  function addOccluder() {
    const occ = new THREE.Mesh(
      new THREE.SphereGeometry(CFG.radius * 0.95, 64, 64), // below the glow (0.975) so it isn't clipped
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true })
    );
    globe.add(occ);
  }
  
  /* ---------- rim glow / atmosphere (fresnel halo at the edge) ---------- */
  let atmosphereMat = null;
  function addAtmosphere() {
    atmosphereMat = new THREE.ShaderMaterial({
      uniforms: {
        uWarm: { value: new THREE.Color(CFG.glowWarm) },
        uCool: { value: new THREE.Color(CFG.glowCool) },
        uPowerTopWarm: { value: CFG.glowPowerTopWarm },
        uCoolFade: { value: CFG.glowCoolFade },
        uPowerMeet: { value: CFG.glowPowerMeet },
        uIntensity: { value: CFG.glowIntensity },
        uMeetFade: { value: CFG.glowMeetFade },
        uWarmBoost: { value: CFG.glowWarmBoost },
        uHotPower: { value: CFG.glowHotPower },
        uHotWarm: { value: CFG.glowHotWarm },
        uHotCool: { value: CFG.glowHotCool },
        uBlend: { value: CFG.glowBlend },
        uAxis: { value: new THREE.Vector3(1, 0, 0) },
        uCam: { value: new THREE.Vector3() }
      },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vPosW;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosW = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uWarm; uniform vec3 uCool;
        uniform float uPowerTopWarm; uniform float uCoolFade; uniform float uPowerMeet; uniform float uIntensity;
        uniform float uMeetFade; uniform float uWarmBoost; uniform float uBlend; uniform vec3 uAxis; uniform vec3 uCam;
        uniform float uHotPower; uniform float uHotWarm; uniform float uHotCool;
        varying vec3 vNormalW; varying vec3 vPosW;
        void main(){
          vec3 viewDir = normalize(uCam - vPosW);
          float rim = 1.0 - abs(dot(viewDir, vNormalW));    // 1 at the silhouette, 0 face-on
          float side = dot(normalize(vPosW), normalize(uAxis)); // -1..1
          float m = smoothstep(-uBlend, uBlend, side);      // 0 = cool half, 1 = warm half
          vec3 col = mix(uCool, uWarm, m);
          float hot = pow(rim, uHotPower) * mix(uHotCool, uHotWarm, m); // white-hot core right at the edge
          col = mix(col, vec3(1.0), clamp(hot, 0.0, 1.0));
          float k = abs(side);                              // 1 at each arc's top, 0 at meeting zones
          float aWarm = pow(rim, mix(uPowerMeet, uPowerTopWarm, k));                    // orange: peaks at edge, smooth fade
          float aCool = mix(pow(rim, uPowerMeet), smoothstep(0.0, uCoolFade, rim), k);  // blue: broad band, dissolves smoothly
          float base = mix(aCool, aWarm, m);
          float inten = uIntensity * mix(uMeetFade, 1.0, k) * mix(1.0, uWarmBoost, m); // orange edge a touch brighter
          float a = base * inten;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.glowRadius, 64, 64), atmosphereMat);
    scene.add(mesh); // view-relative glow; not parented to the spinning globe
  }
  
  /* ---------- regional English Channel "gateway" map (France / England / islands / cities) ---------- */
  async function buildRegionMap() {
    if (!regionEl) return;
    const lonMin = -6.5, lonMax = 5.5, latMin = 47.5, latMax = 52.7;
    const Wv = 1000;
    const Hv = Wv * ((latMax - latMin) / ((lonMax - lonMin) * Math.cos((latMin + latMax) / 2 * Math.PI / 180)));
    const px = lon => ((lon - lonMin) / (lonMax - lonMin) * Wv);
    const py = lat => ((latMax - lat) / (latMax - latMin) * Hv);
    const XY = (lon, lat) => px(lon).toFixed(1) + ',' + py(lat).toFixed(1);
    const ringsToPath = rings => rings.map(r => r.map((pt, i) => (i ? 'L' : 'M') + XY(pt[0], pt[1])).join('') + 'Z').join('');
  
    // detailed coastlines: prefer high-detail land-10m, fall back to the already-loaded land-110m
    let polys = LAND_POLYS;
    try {
      const topo = await fetch(new URL('../_vendor/world-atlas-2/land-10m.json', import.meta.url).href, { cache: 'force-cache' }).then(r => r.json());
      const geo = topojson.feature(topo, topo.objects.land);
      const feats = geo.type === 'FeatureCollection' ? geo.features : [geo];
      const pp = [];
      feats.forEach(f => { const g = f.geometry; if (g.type === 'Polygon') pp.push(g.coordinates); else if (g.type === 'MultiPolygon') g.coordinates.forEach(x => pp.push(x)); });
      if (pp.length) polys = pp;
    } catch (e) { /* keep 110m */ }
    if (!polys) return;
  
    let land = '';
    polys.forEach(rings => {
      const b = bbox(rings[0]);
      if (b.maxLon < lonMin || b.minLon > lonMax || b.maxLat < latMin || b.minLat > latMax) return;
      land += '<path class="land" d="' + ringsToPath(rings) + '"/>';
    });
    let isles = '';
    if (CIGEO && CIGEO.features) CIGEO.features.forEach(f => {
      const g = f.geometry;
      if (g.type === 'Polygon') isles += '<path class="isle" d="' + ringsToPath(g.coordinates) + '"/>';
    });
  
    // TSS (Traffic Separation Schemes) — recognisable two-lane magenta blocks with chevrons
    const pxPerLat = Hv / (latMax - latMin);
    function tssScheme(lon, lat, bearingDeg, lenDeg, W, gap) {
      const cx = px(lon), cy = py(lat);
      const b = bearingDeg * Math.PI / 180, dx = Math.sin(b), dy = -Math.cos(b), nx = -dy, ny = dx;
      const L = lenDeg * pxPerLat, P = (a, c) => a.toFixed(1) + ',' + c.toFixed(1);
      const lane = (sign, adir) => {
        const ox = nx * sign * (W / 2 + gap / 2), oy = ny * sign * (W / 2 + gap / 2);
        const ccx = cx + ox, ccy = cy + oy, hx = dx * L / 2, hy = dy * L / 2, wx = nx * W / 2, wy = ny * W / 2;
        let s = '<path class="tssblk" d="M' + P(ccx-hx-wx, ccy-hy-wy) + ' L' + P(ccx+hx-wx, ccy+hy-wy) +
          ' L' + P(ccx+hx+wx, ccy+hy+wy) + ' L' + P(ccx-hx+wx, ccy-hy+wy) + 'Z"/>';
        for (let i = 0; i < 3; i++) {
          const t = ((i + 0.5) / 3 - 0.5), chx = ccx + dx * L * t, chy = ccy + dy * L * t, ax = dx * adir, ay = dy * adir;
          s += '<path class="tssch" d="M' + P(chx - ax*W*0.1 - nx*W*0.32, chy - ay*W*0.1 - ny*W*0.32) +
            ' L' + P(chx + ax*W*0.28, chy + ay*W*0.28) +
            ' L' + P(chx - ax*W*0.1 + nx*W*0.32, chy - ay*W*0.1 + ny*W*0.32) + '"/>';
        }
        return s;
      };
      return lane(1, 1) + lane(-1, -1); // two opposite-direction lanes = the two-sided scheme
    }
    const tss =
      tssScheme(-2.75, 50.00, 60, 0.32, 13, 5) +   // Casquets — mid-water between England & France
      tssScheme(1.40, 50.90, 45, 0.34, 13, 5) +    // Dover Strait
      tssScheme(-5.50, 48.55, 5, 0.34, 13, 5);     // Ushant (off NW Brittany)
  
    // flights island -> cities, comet gradient (transparent tail at the islands -> bright head at the city)
    const CI0 = [-2.35, 49.42];
    const cities = [[-0.13, 51.5, 'rf1', 'fg1'], [4.90, 52.37, 'rf2', 'fg2'], [2.35, 48.85, 'rf3', 'fg3']];
    let defs = '<defs>';
    cities.forEach(([lon, lat, cls, gid]) => {
      defs += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + px(CI0[0]).toFixed(1) + '" y1="' + py(CI0[1]).toFixed(1) + '" x2="' + px(lon).toFixed(1) + '" y2="' + py(lat).toFixed(1) + '">' +
        '<stop offset="0" stop-color="#FF8A1E" stop-opacity="0"/><stop offset="0.7" stop-color="#FF8A1E" stop-opacity="0.25"/><stop offset="1" stop-color="#FFB247" stop-opacity="1"/></linearGradient>';
    });
    defs += '</defs>';
    let flights = '';
    cities.forEach(([lon, lat, cls, gid]) => { flights += '<path class="rflight ' + cls + '" style="stroke:url(#' + gid + ')" d="M' + XY(CI0[0], CI0[1]) + ' L' + XY(lon, lat) + '"/>'; });
  
    const mk = (lon, lat, name, cls) => {
      const x = px(lon), y = py(lat);
      return '<circle class="mk" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6"/>' +
             '<text class="lbl ' + (cls || '') + '" x="' + (x + 12).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '">' + name + '</text>';
    };
    const ilbl = (lon, lat, name) => '<text class="lbl cilbl ilbl" x="' + (px(lon) + 10).toFixed(1) + '" y="' + (py(lat) - 4).toFixed(1) + '">' + name + '</text>';
    const town = (lon, lat, name) => {
      const x = px(lon), y = py(lat);
      return '<circle class="towndot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.4"/>' +
             '<text class="town" x="' + (x + 5).toFixed(1) + '" y="' + (y + 2.6).toFixed(1) + '">' + name + '</text>';
    };
    const marks = mk(-0.13, 51.5, 'London') + mk(2.35, 48.85, 'Paris') + mk(4.90, 52.37, 'Amsterdam') +
      ilbl(-2.11, 49.19, 'Jersey') + ilbl(-2.58, 49.46, 'Guernsey') +
      town(-2.106, 49.186, 'St Helier') + town(-2.536, 49.455, 'St Peter Port') +
      town(-1.40, 50.90, 'Southampton') + town(-3.53, 50.72, 'Exeter') + town(-5.07, 50.15, 'Falmouth') +
      town(-2.02, 48.65, 'St Malo') + town(-1.68, 48.11, 'Rennes');

    // title, set above Guernsey at the gateway
    const titleX = px(-2.9).toFixed(1), titleY1 = py(50.28).toFixed(1), titleY2 = py(50.02).toFixed(1);
    const regionTitle = '<text class="rtitle-ey" x="' + titleX + '" y="' + titleY1 + '" text-anchor="middle">THE CHANNEL ISLANDS</text>' +
      '<text class="rtitle-h1" x="' + titleX + '" y="' + titleY2 + '" text-anchor="middle">The Atlantic Gateway</text>';

    regionEl.innerHTML = '<svg viewBox="0 0 ' + Wv + ' ' + Hv.toFixed(0) + '" preserveAspectRatio="xMidYMid meet">' +
      defs + land + isles + '<g class="tssg">' + tss + '</g><g class="rflights">' + flights + '</g>' + marks + regionTitle + '</svg>';
    regionSvg = regionEl.querySelector('svg'); // for viewBox zoom-into-Jersey
  }
  
  /* ---------- Channel Islands close-up (flat dot map at island scale) ---------- */
  function makeFlatPoints(positions, color, size, opacity, additive) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => { arr[i*3] = p.x; arr[i*3+1] = p.y; arr[i*3+2] = p.z; });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(color), size, map: SPRITE, sizeAttenuation: true,
      transparent: true, opacity, depthWrite: false, depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 10;
    return pts;
  }
  
  // sample the CI coastlines to a flat dot grid (same coastline/interior classification, projected to a plane)
  function generateCIDots(polygons) {
    const c = CFG.islandCenter, K = CFG.islandScaleK, step = CFG.islandTileDeg;
    const cosC = Math.cos(c.lat * Math.PI / 180);
    const polys = polygons.map(rings => ({ rings, bb: bbox(rings[0]) }));
    function isLand(lon, lat) {
      for (const p of polys) {
        const b = p.bb;
        if (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat) continue;
        if (pointInPolygon(lon, lat, p.rings)) return true;
      }
      return false;
    }
    const project = (lon, lat) => new THREE.Vector3((lon - c.lng) * cosC * K, (lat - c.lat) * K, 0);
    // overall bbox
    let minLon = 9e9, maxLon = -9e9, minLat = 9e9, maxLat = -9e9;
    polys.forEach(p => { const b = p.bb; minLon = Math.min(minLon, b.minLon); maxLon = Math.max(maxLon, b.maxLon); minLat = Math.min(minLat, b.minLat); maxLat = Math.max(maxLat, b.maxLat); });
    const fill = [], edge = [];
    for (let lat = minLat; lat <= maxLat; lat += step) {
      for (let lon = minLon; lon <= maxLon; lon += step) {
        if (!isLand(lon, lat)) continue;
        const coast = !isLand(lon + step, lat) || !isLand(lon - step, lat) || !isLand(lon, lat + step) || !isLand(lon, lat - step);
        (coast ? edge : fill).push(project(lon, lat));
      }
    }
    return { fill, edge };
  }
  
  function addIslands() {
    if (!CIGEO || !CIGEO.features) return;
    const polys = [];
    CIGEO.features.forEach(f => {
      const g = f.geometry;
      if (g.type === 'Polygon') polys.push(g.coordinates);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(pp => polys.push(pp));
    });
    const { fill, edge } = generateCIDots(polys);
    islandsGroup = new THREE.Group();
    const f2 = makeFlatPoints(fill, CFG.islandFillColor, CFG.islandFillSize, 0, false); islandFillMat = f2.material; islandsGroup.add(f2);
    const e2 = makeFlatPoints(edge, CFG.islandEdgeColor, CFG.islandEdgeSize, 0, true); islandEdgeMat = e2.material; islandsGroup.add(e2);
    islandsGroup.visible = false;
    scene.add(islandsGroup);
    console.log('island dots:', { fill: fill.length, edge: edge.length });
  }
  
  /* ---------- boot ---------- */
  async function boot() {
    let polygons;
    try {
      const topo = await fetch(CFG.landUrl, { cache: 'force-cache' }).then(r => {
        if (!r.ok) throw new Error('land fetch ' + r.status); return r.json();
      });
      const geo = topojson.feature(topo, topo.objects.land); // Feature<MultiPolygon> or FeatureCollection
      const feats = geo.type === 'FeatureCollection' ? geo.features : [geo];
      polygons = [];
      for (const f of feats) {
        const g = f.geometry;
        if (g.type === 'Polygon') polygons.push(g.coordinates);
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => polygons.push(poly));
      }
    } catch (e) {
      statusEl.textContent = 'Could not load land data (needs internet)'; dispatchEvent(new Event('cips:globe-failed'));   // (index.html's loading screen says so)
      console.error(e); return;
    }
  
    LAND_POLYS = polygons; // keep for the regional Channel map
    const { fill, edge } = generateDots(polygons);
  
    addOccluder(); // depth-only sphere, before the transparent layers
    const fillPts = makePoints(fill, CFG.fillColor, CFG.fillSize * CFG.sizeScale, CFG.fillOpacity, CFG.killBack, CFG.fillAdditive);
    globe.add(fillPts); fillFade = { mat: fillPts.material, base: CFG.fillOpacity, size: fillPts.material.size }; worldFade.push(fillFade);
    const edgePts = makePoints(edge, CFG.edgeColor, CFG.edgeSize * CFG.sizeScale, CFG.edgeOpacity, CFG.killBack, CFG.edgeAdditive);
    globe.add(edgePts); edgeFade = { mat: edgePts.material, base: CFG.edgeOpacity, size: edgePts.material.size }; worldFade.push(edgeFade);
    buildCoast(); buildNight(); buildKinship(); buildVoyageRouteMesh(); setTimeout(() => { buildNightPatch(9, { lonMin: -3.7, lonMax: -1.1, latMin: 48.35, latMax: 50.25 }, -2, CFG.radius * 1.0016, [0.72, 0.82]); buildPlate(); }, 2500);
    addArcsAndEndpoints();
    buildShipLanes();
    addOceanLabel(); addTownLabels();
    if (o.ais) { try { live = await initLive({ lonLatToVec3, makeArc, globe, CFG, SPRITE, worldFade, labelObjs, stage, makePoints, CI, faceQuat, settleFocus, camera, host, config: o.ais, onChangeDestination, onObserveJump: jumpToObserve }); } catch (e) { console.error('[globe-live] live layer failed', e); } }
    else stage.querySelectorAll('[data-live="panel"],[data-live="key"]').forEach(el => el.remove());   // no AIS: the picker and the colour key come out of the DOM
    // AIS live layer intentionally not started — `live` stays null; every use of it below (search `live ?` / `live?.`) already degrades gracefully
    // atmosphere is now the CSS #globeglow (UC-style), not a shader
    computeStart();    // starting view
    computeCIFacing(); // zoom target: Channel Islands centred
    { const a = startQuat.angleTo(ciFacingQuat); REORIENT_END = Math.min(REORIENT_MAX, REORIENT_MIN + (REORIENT_MAX - REORIENT_MIN) * Math.min(1, a / REORIENT_SCALE)); }
    // buildRegionMap() intentionally not called: the CIPS sequence already hands off to cloud-pass/seaway-wake,
    // which draw their own Channel Islands chart (_beats/_shared/channel-chart.js) — building this one too
    // showed two maps back-to-back in the same transition.
  
    statusEl.style.display = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => dispatchEvent(new Event('cips:globe-ready'))));   // 5 Nov 2026: index.html's loading screen fades once the first frames of the globe are on screen
    hintEl.style.transition = 'opacity 1s'; hintEl.style.opacity = 1;
    console.log('dots:', { fill: fill.length, edge: edge.length });
  }
  
  /* ---------- render loop ---------- */
  const camWorld = new THREE.Vector3();
  let lastFrame = 0;
  // 17 Sep 2026, Simon: "Observe the Channel Islands" should cap scroll at MONITOR_CAP rather than carrying on into
  // later beats — the runtime owns scroll->p (beats "never read window.scrollY" per its own contract, stage.js),
  // and doesn't expose the pixel offsets a beat would need to compute an exact scrollY target for a given p. Rather
  // than reach into that, this tracks the LOCAL relationship between p and window.scrollY frame to frame (it's a
  // straight line within one beat's own track) and corrects scrollY directly once it has a real slope to work
  // from — same pragmatic scrollTo() use as the CTA/search/button resets elsewhere in this file, just continuous
  // instead of one-shot.
  const MONITOR_CAP = 0.82;
  let capLastP = null, capLastScrollY = null, capPxPerP = null;
  // 24 Sep 2026, Simon: found the real cause of the callout card still landing off-stage even after the calloutCorner
  // clamp fix (23 Sep) — kinHostR/kinStageR's very first capture (line ~558, module setup, before this beat's own
  // layout has necessarily settled — fonts, the "reason boxes" pushing the hero copy, scrollbar appearance, etc. can
  // all still be pending at that point) can measure a taller-than-real stage, and since it's cached rather than
  // re-read every frame (deliberately, to avoid layout-thrash — see the comment there), nothing ever corrected it
  // afterward unless host's OWN size later changed enough to refire the ResizeObserver. The clamp itself uses this
  // same stale height as its bound, so it just legalised the wrong ceiling instead of catching the overflow.
  // Re-measuring once here, on the first real tick (after mount/boot and whatever layout settling happens before
  // the runtime starts driving this beat), catches that initial mismeasurement without adding a per-frame cost.
  let didInitialResize = false;
  function tick(now) {
    if (!didInitialResize) { didInitialResize = true; __resize(); }
    const f = lastFrame ? Math.min(3, (now - lastFrame) / 16.666) : 1;
    lastFrame = now;

    // scroll-driven zoom + orientation
    const p = scrollProgress();
    if (capLastP != null) { const dp = p - capLastP; if (Math.abs(dp) > 1e-6) capPxPerP = (window.scrollY - capLastScrollY) / dp; }
    capLastP = p; capLastScrollY = window.scrollY;
    if (voyageMonitorMode && p > MONITOR_CAP && capPxPerP) window.scrollTo(0, Math.max(0, window.scrollY - (p - MONITOR_CAP) * capPxPerP));
    // idle spin only while genuinely at rest — REST_EPS (not a strict p<=0) because the group section's own
    // getBoundingClientRect().top sits at a fraction of a px off zero even at scrollY=0 (found testing, 17 Sep:
    // rect.top=-0.5px measured at rest → p≈0.0001, which rounds to "0%" in the HUD but fails a strict <=0 check
    // every single time — spin never actually started). Freezes the instant real scrolling starts either way.
    const REST_EPS = 0.001;
    // 17 Sep 2026, Simon: idle spin halves once settled on a followed vessel (live.spinScale, set from
    // slowSpin/focusIsShip in live.js's frame()) so she stays in view longer before drifting off — normal rate
    // otherwise, including once the callout's "X" has recentred back on the Channel Islands.
    if (!dragging && p < REST_EPS && !voyageHold) spinY += SPIN_RATE * (live && live.spinScale != null ? live.spinScale : 1) * f;
    if (!dragging && (velYaw || velPitch)) {   // flick momentum: keep turning at the speed it was let go at, slowing by friction
      dragYaw += velYaw * f; dragPitch += velPitch * f;
      if (dragPitch > 0.8 || dragPitch < -0.8) { dragPitch = Math.max(-0.8, Math.min(0.8, dragPitch)); velPitch = 0; }
      const fr = Math.pow(SPIN_FRICTION, f); velYaw *= fr; velPitch *= fr;
      if (Math.abs(velYaw) < 0.00008) velYaw = 0; if (Math.abs(velPitch) < 0.00008) velPitch = 0;
    }
    const yq = new THREE.Quaternion().setFromAxisAngle(YAXIS, spinY + dragYaw);
    const pq = new THREE.Quaternion().setFromAxisAngle(XAXIS, BASE_X + dragPitch);
    const q = pq.multiply(yq).multiply(startQuat);                        // START view + idle spin + drag
    if (live) { const dpt = camera.position.z - CFG.radius; live.frame(now, f, p, dpt / (FAR_Z - CFG.radius), 2 * dpt * Math.tan(CFG.fov / 2 * Math.PI / 180) / (host.clientHeight || 900)); }
    globe.quaternion.copy(live ? live.applyFocus(q, p) : q).slerp(ciFacingQuat, smooth(0, REORIENT_END, p));  // reorientation now happens first, driven by scroll from p=0 (was idle-spin-then-settle-while-zooming) — completes at REORIENT_END, before the zoom below begins
    // Voyage Planner Phase 4 (18 Sep 2026, Simon's first-pass feedback): keep the travelling route ship roughly
    // centred through her ocean-transit leg — otherwise she just rides whatever idle-spin/reorientation the camera
    // was already doing, and a ship starting somewhere like the US East Coast could sit off-screen the whole time.
    // Fades back out over the same endBlend window as her own match-cut (placeVoyageRoute), handing framing over to
    // the deep zoom's jerseyQuat pull below rather than fighting it. Placed BEFORE that pull for the same reason —
    // whichever slerp runs last wins, and jerseyQuat should always get the final say once it's actually engaged.
    if (voyageRouteMode && voyageRouteFaceLL) {
      routeFocusMix = Math.min(1, routeFocusMix + 0.03 * f);
      const shipFocusFade = 1 - smooth(VOYAGE_ROUTE.endBlend[0], VOYAGE_ROUTE.endBlend[1], p);
      if (shipFocusFade > 0) globe.quaternion.slerp(faceQuat(voyageRouteFaceLL.lon, voyageRouteFaceLL.lat), routeFocusMix * shipFocusFade);
    } else if (routeFocusMix > 0) { routeFocusMix = 0; }
    // 4 Nov 2026, Simon: the same for the demo vessel from whichever departure was chosen (Monaco, Rotterdam, St Maarten): the globe stays turned to her
    // through the passage, easing back out over her own match-cut window, before the Jersey pull below takes over.
    if (kinFaceLL && !voyageRouteMode && p > 0.002) {
      kinFocusMix = Math.min(1, kinFocusMix + 0.03 * f);
      const kinFade = 1 - smooth(KIN.endBlend[0], KIN.endBlend[1], p);
      if (kinFade > 0) globe.quaternion.slerp(faceQuat(kinFaceLL.lon, kinFaceLL.lat), kinFocusMix * kinFade);
    } else if (kinFocusMix > 0) { kinFocusMix = 0; }
    // HLC lab — the deep zoom: from 70% the camera keeps coming, exponentially (constant perceived rate), down to CLOSE_DEPTH above
    // Jersey, while the globe eases from the archipelago-centred frame to Jersey-centred, north up
    const z2 = smooth(0.70, 1.0, p);
    const depth = (NEAR_Z - CFG.radius) * Math.pow(CLOSE_DEPTH / (NEAR_Z - CFG.radius), z2);
    if (!jerseyQuat) jerseyQuat = faceQuat(-2.11, 49.19);
    if (z2 > 0) globe.quaternion.slerp(jerseyQuat, smooth(0, 0.5, z2));
    const hold = live ? live.focusDepth(p, f) : 1;                                      // the picker's Show / Back to the Gateway zoom, while the globe is in its hold
    camera.position.set(0, 0, z2 > 0 ? CFG.radius + depth : lerp(CFG.radius + (FAR_Z - CFG.radius) * hold, NEAR_Z, smooth(REORIENT_END, 0.62, p)));       // then fly in, once reorientation's done
    camera.near = Math.max(0.0005, depth * 0.2); camera.updateProjectionMatrix();
    placeKinship(p, camera.position.z - CFG.radius);
    placeVoyageRoute(p, camera.position.z - CFG.radius);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // arcs thin as we approach — and thin in step with any extra zoom beyond what this beat's own scroll expects, so an
    // arc stays a thread rather than swelling into a slab if the camera ever ends up closer than the scripted depth
    // (Howard's lab, 15 Sep — guards against the picker's "Show her" zoom and the deep zoom)
    const expectDepth = lerp(FAR_Z - CFG.radius, NEAR_Z - CFG.radius, smooth(REORIENT_END, 0.62, p));
    const zoomK = Math.min(1, (camera.position.z - CFG.radius) / expectDepth);
    // 5 Nov 2026, Simon: "make the comet arcs thinner and more refined, they are too chunky as the zoom increases". The thickness was a size in the world, so it swelled on
    // screen as the camera closed in. Now it is scaled with the camera's height above the globe: the same fine thread on screen at any zoom, easing to about half as the
    // camera arrives (ARC_NEAR_K). The world view (the start) is unchanged.
    const ARC_NEAR_K = 0.5, camDepth = Math.max(1e-6, camera.position.z - CFG.radius);
    ARC_TH.value = CFG.arcThickness * Math.min(1, camDepth / (FAR_Z - CFG.radius)) * lerp(1, ARC_NEAR_K, smooth(REORIENT_END, 0.65, p));
    if (endpointMat) endpointMat.size = CFG.endpointSize * 1.6 * Math.min(1, camDepth / (FAR_Z - CFG.radius));   // 5 Nov 2026, Simon: the city dots stay pin pricks as we zoom in (they swelled with the zoom) // arcs thin as we approach (zoomK no longer needed: the depth scaling covers any extra zoom)
  
    // world globe stays visible until the very end of this beat's own track — cloud-pass crossfades in over it
    // (fadePrev), so fading the globe out early here just left a blank gap before the next beat's imagery arrived.
    // the approach: from about half way, the coarse dots shrink and dim while the drawn coastline comes up beneath them
    const fine = smooth(0.42, 0.64, p);
    const gone = smooth(0.6, 0.8, p);
    if (fillFade) { fillFade.mat.size = fillFade.size * lerp(1, 0.14, fine); fillFade.base = CFG.fillOpacity * lerp(1, 0.18, fine) * (1 - gone); }
    if (edgeFade) { edgeFade.mat.size = edgeFade.size * lerp(1, 0.2, fine); edgeFade.base = CFG.edgeOpacity * lerp(1, 0.35, fine) * (1 - 0.8 * gone); }
    // lanes are now thin THREE.Line strands (not additive point sprites), so screen-space width stays modest at any zoom —
    // no more size-shrink-on-approach needed; each strand's opacity is a fixed per-strand base, handled by the generic
    // worldFade pass above like everything else pushed into it
    const worldA  = o.fadeOut === false ? 1 : 1 - smooth(0.90, 1.0, p);
    if (coastMat) coastMat.opacity = 0.85 * smooth(0.5, 0.68, p) * (1 - 0.55 * smooth(0.66, 0.78, p)) * (1 - smooth(0.8, 0.9, p)) * worldA;   // the outline yields to the aerial, gone before the plate

    const regionT = 0;                                        // internal region chart disabled — see mount()
    const deep = smooth(0.46, 0.58, p);                          // the copy, the outline and the glow are fully gone by p=0.58 (moved earlier again 15 Sep — was [0.55,0.68])
    const arcsGone = smooth(0.62, 0.75, p);                      // the comet arcs and endpoint dots are gone by ~75%, before Kinship matters
    // 18 Sep 2026, Simon: the shipping lanes stay dim except whichever one(s) the current route actually rides —
    // hl eases toward 1 (that lane) or 0 (everyone else) each frame rather than snapping, same lightweight
    // ease-toward-target as routeFocusMix above.
    const routeEdgeSet = (voyageRouteMode && voyageRoute) ? voyageRoute.usedEdges : null;
    for (const w of worldFade) {
      if (w.edgeKey) {
        const target = routeEdgeSet && routeEdgeSet.has(w.edgeKey) ? 1 : 0;
        w.hl += (target - w.hl) * Math.min(1, 0.05 * f);
        w.mat.opacity = lerp(w.base, w.brightBase, w.hl) * worldA;
      } else {
        w.mat.opacity = w.base * worldA * (w.kind === 'arc' ? 1 - arcsGone : 1);
      }
    }
    for (const P of patches) P.mat.opacity = smooth(P.in[0], P.in[1], p) * worldA;
    const copyEl = stage.querySelector('.globeCopy'), statsEl = stage.querySelector('.gstats'), keyEl = stage.querySelector('.lkey'), panelEl = stage.querySelector('.lpanel');
    if (copyEl) copyEl.style.opacity = (1 - deep).toFixed(3);
    { const c2 = stage.querySelector('[data-g="copy2"]'); if (c2) { const a = smooth((o.copy2In || [0.82, 0.90])[0], (o.copy2In || [0.82, 0.90])[1], p); c2.style.opacity = a.toFixed(3); c2.style.transform = `translateY(${((1 - a) * 12).toFixed(1)}px)`; } }   // the second line, once the first has gone
    // 17 Sep 2026: these two were dead code — a stray line comment above swallowed both statements (everything after
    // // on that physical line was comment text, never executed), so stats/key never actually got an opacity at all.
    // Simon asked for stats to fade with the hero copy — same (1-deep) formula copyEl already uses, so restoring this puts them in sync.
    if (statsEl) statsEl.style.opacity = (1 - deep).toFixed(3);
    // 17 Sep 2026, Simon: the colour key explains the FLEET ICONS' own colours (cargo/tanker/etc — live.js's
    // rebuildIcons()), which don't exist yet in the world view — it used to fade with the hero copy (1-deep),
    // meaning it showed while there was nothing coloured to explain, and had already faded out again by the time
    // the icons actually arrive (fleetIn only starts past p=0.56, deep is fading it out well before that). Tied to
    // live.js's own fleetIn instead, so it's only up exactly when there are chevrons on screen for it to explain.
    if (keyEl) keyEl.style.opacity = (live ? live.fleetIn : 0).toFixed(3);
    const panelGone = smooth(0.02, 0.09, p);   // 19 Sep 2026, Simon: the finder should get out of the way as soon as scrolling starts, not linger until the copy has gone
    // 3 Oct 2026, Simon: the finder now STAYS as the voyage's card (see .lvoyage in beat.html) — while a vessel is being followed/sailed it
    // collapses to the vessel card instead of fading out. voyageCardMode is the single switch; everything below that used to fade/hide the
    // panel respects it. A fresh voyage after "Change ship" re-arms it (voyagePanelForced is cleared on the rising edge).
    let voyageCardMode = false;
    if (VOYAGE_CARD_IN_FINDER) {
      const wantVoyage = !voyageMonitorMode && (voyageExampleArmed || stage.classList.contains('following'));   // demo: 3 Oct 2026, Simon — the finder collapses to the vessel card the moment "Bring in a demo vessel" is clicked (the header cue takes over from the OR button straight away)
      if (wantVoyage && !voyageWasWanted) voyagePanelForced = false;
      voyageWasWanted = wantVoyage;
      voyageCardMode = wantVoyage && !voyagePanelForced;
      stage.classList.toggle('voyage-mode', voyageCardMode);
      voyageHold = voyageCardMode; stage.classList.toggle('vessel-picked', voyageCardMode);   // vessel-picked: the hero "Start your voyage" button gives way to just the skip link (beat.css)
      if (voyageHeadB) { const t = voyageCardMode ? 'Your voyage' : VOYAGE_HEAD_LABEL; if (voyageHeadB.textContent !== t) voyageHeadB.textContent = t; }
      if (voyageCardMode) for (const c of [kinCalloutCard, routeCalloutCard]) if (c) c.style.display = parseFloat(c.style.opacity || '0') > 0.01 ? '' : 'none';
      // the scroll cue (.lcue, in the panel header): wanted from the moment the demo is armed — or the live route's calculation has finished
      // ("Scroll to…" on its .ltake) — until the first real scroll, and again if they come back to the top
      if (voyageCue) {
        const lt = voyageSlot?.querySelector('.ltake'), liveReady = !!lt && /^scroll/i.test(lt.textContent.trim());   // live ship: its route has finished calculating ("Scroll to see your route…")
        if (lt) lt.classList.toggle('cue-moved', liveReady);   // its own in-card prompt gives way to the header cue (one cue, not two)
        const cueWanted = voyageCardMode && (voyageExampleArmed || liveReady || routeCueSeen) && p < 0.92;
        if (liveReady) routeCueSeen = true; else if (!stage.classList.contains('following') && !voyageExampleArmed) routeCueSeen = false;
        const nowMs = performance.now();
        if (cueWanted && !cueWasOn) cueShownAt = nowMs;
        cueWasOn = cueWanted;
        // 4 Oct 2026, Simon: it shows when the ship is chosen (steady, flashing if nobody scrolls within 3s), steps aside while they scroll, and
        // comes back flashing after 2s without scrolling. "away" fades it out but keeps its room in the card, so the card doesn't jump.
        const scrolledSince = voyageLastScrollAt > cueShownAt, idleMs = nowMs - voyageLastScrollAt;
        const cueAway = scrolledSince && idleMs < 2000;
        voyageCue.hidden = !cueWanted;
        voyageCue.classList.toggle('away', cueWanted && cueAway);
        voyageCue.classList.toggle('flash', cueWanted && !cueAway && (scrolledSince || nowMs - cueShownAt > 3000));
      }
      // an empty slot (demo armed, card not typed in yet) shouldn't leave a stray toggle + rule behind
      if (voyageSlot) { const liveCard = voyageSlot.querySelector('.kin-callout-card:not([data-g]):not(.voyage-route-callout)'); voyageSlot.hidden = !(voyageCardMode && [kinCalloutCard, routeCalloutCard, liveCard].some(c => c && !c.hidden && c.style.display !== 'none' && parseFloat(c.style.opacity || '1') > 0.01)); }
      // 3 Oct 2026, Simon: nudge the globe a little LEFT while the voyage card is up, so a route from the north/east (Baltic, Scandinavia)
      // isn't tucked under the panel. Only mid-voyage: it has to be back at the normal +2vw by the deep zoom, because exit() (the match cut
      // into the next beat) measures the end frame assuming that, and the hero copy on the left needs the +2vw at p=0.
      { const nudge = voyageCardMode ? smooth(0.03, 0.10, p) * (1 - smooth(0.55, 0.75, p)) : 0; const gxv = lerp(2, -3, nudge).toFixed(2) + 'vw'; if (gxv !== voyageGxShown) { voyageGxShown = gxv; globeLayerEl.style.setProperty('--gx', gxv); kinHostR = host.getBoundingClientRect(); kinStageR = stage.getBoundingClientRect(); } }   // the AIS marker / leader line project through the cached host rect (worldToStagePx), refreshed only on resize — so re-read it whenever the shift actually moves, or the marker slides off the ship (looked like her crossing Portugal)
    }
    if (panelEl) {
      panelEl.style.opacity = (voyageCardMode || voyagePanelForced) ? '1' : (1 - panelGone).toFixed(3);
      panelEl.style.pointerEvents = voyageCardMode || voyagePanelForced || panelGone <= 0.5 ? 'auto' : 'none';
    }
    if (voyageReopenBtn) {   // the finder's collapsed stand-in — fades in as the panel fades out (scroll) OR the instant
      // "Follow this ship" hides it manually (stage.following, live.js) — gone for good once forced back
      const reopenA = (voyagePanelForced || voyageCardMode) ? 0 : (stage.classList.contains('following') ? 1 : panelGone);
      voyageReopenBtn.style.opacity = reopenA.toFixed(3);
      voyageReopenBtn.style.pointerEvents = reopenA > 0.5 ? 'auto' : 'none';
      // 17 Sep 2026, Simon: same button, same click behaviour throughout — just reads differently while "Observe the
      // Channel Islands" is capping scroll at MONITOR_CAP, since picking a ship is the only way further in from there.
      const reopenLabel = voyageMonitorMode ? 'Find a ship to take in' : VOYAGE_REOPEN_LABEL;
      if (voyageReopenBtn.textContent !== reopenLabel) voyageReopenBtn.textContent = reopenLabel;
      // 17 Sep 2026, Simon: back to the dark pill by default (was tried solid orange throughout, reverted same
      // day) — was flipped solid orange once scroll reached the MONITOR_CAP lock as the "you've arrived" signal;
      // 18 Sep 2026, Simon: that read as too static too — dropped the permanent colour change entirely now, same
      // "stays normal at rest" treatment as the ship-finder's own gate hint. voyageCapPulse() (above) is the only
      // signal left, firing on each actual attempt to scroll past the cap.
      // "Enter the approaches" (17 Sep 2026) — stacked under the pill above, same visibility window, but only ever
      // while actually in "Observe the Channel Islands" (picking a real ship makes it moot everywhere else)
      if (voyageEnterBtn) {
        const enterA = voyageMonitorMode ? reopenA : 0;
        voyageEnterBtn.style.opacity = enterA.toFixed(3);
        voyageEnterBtn.style.pointerEvents = enterA > 0.5 ? 'auto' : 'none';
      }
    }
    // "use example vessel" prompt (17 Sep 2026) — armed on click, pulses until p passes 0.57 (Kinship's marker is
    // taking over by then), a progress cutoff rather than "stops on the first scroll"
    if (voyageExampleBtn) voyageExampleBtn.classList.toggle('pulse', voyageExampleArmed && p < 0.57);
    if (voyageMonitorBtn) voyageMonitorBtn.classList.toggle('pulse', voyageMonitorArmed && p < 0.57);
    if (globeGlowEl) {
      globeGlowEl.style.opacity = (worldA * (1 - deep)).toFixed(3);
      // 17 Sep 2026, Simon: two tries at this same bug today, both wrong in different ways. First was an empirical
      // depth->scale curve — re-tuning needed for every zoom scenario. Second replaced it with real projection math
      // aiming the glow's rendered diameter at the sphere's TRUE on-screen edge — mathematically sound (checked
      // against a direct pixel measurement, agreed within 1%), but wrong premise: the glow's base size (86.3vh) was
      // never meant to trace the sphere's actual silhouette 1:1 — at the default view it's already visibly smaller
      // than the sphere (an inner light-source glow, not a rim halo), so matching it to the true edge made it read
      // as oversized ("much bigger than the matrix") once actually compared against the dot layer, especially
      // obvious on a large/high-res screen. The fix is simpler than either attempt: preserve whatever ratio it was
      // tuned at (86.3vh at the DEFAULT view's depth, FAR_Z) and scale it by the SAME factor the sphere's own
      // apparent size changes by by, relative to that same default — i.e. lock the two layers' relative sizes
      // together directly, rather than deriving the glow's absolute size from projection math (which only matters
      // if it's supposed to trace the true edge, which it isn't). No viewport/host-size terms at all now, so it
      // can't drift with screen size, DPI or aspect ratio either.
      const glowScale = Math.min(6, (FAR_Z - CFG.radius) / (camera.position.z - CFG.radius));
      globeGlowEl.style.transform = 'translate(calc(-50% + var(--gx)),-50%) scale(' + glowScale.toFixed(3) + ')';
    }
    if (regionEl) regionEl.style.opacity = regionT.toFixed(3);
    if (regionSvg) {
      // starts centred on the islands (matching the globe's CI-centred view), then dives straight into Jersey — no pan
      const zoom = smooth(0.70, 1.0, p);
      const vw = lerp(1000, 111, zoom), vh = vw * 0.6756;
      const cx = lerp(333.3, 365.8, zoom), cy = lerp(422.5, 456.0, zoom);
      regionSvg.setAttribute('viewBox', (cx - vw/2).toFixed(1) + ' ' + (cy - vh/2).toFixed(1) + ' ' + vw.toFixed(1) + ' ' + vh.toFixed(1));
    }
    if (islandsEl) islandsEl.style.opacity = '0'; // island close-up beat removed — the region map zooms straight in
  
    camera.getWorldPosition(camWorld);
    globe.traverse(o => {
      if (o.material && o.material.userData && o.material.userData.shader) {
        o.material.userData.shader.uniforms.uCamPos.value.copy(camWorld);
      }
    });
    if (atmosphereMat) {
      atmosphereMat.uniforms.uCam.value.copy(camWorld);
      const cr = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); // camera right
      const cu = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); // camera up
      const b = CFG.glowWarmBearing * Math.PI / 180;       // 0 = up, clockwise
      const axis = cu.multiplyScalar(Math.cos(b)).addScaledVector(cr, Math.sin(b)).normalize();
      atmosphereMat.uniforms.uAxis.value.copy(axis);
    }
    ARC_T.value += CFG.arcSpeed * f; // advance the comet clock
  
    // hide name labels on the far side of the globe
    if (labelObjs.length) {
      const gq = new THREE.Quaternion(); globe.getWorldQuaternion(gq);
      for (const L of labelObjs) {
        const wn = L.normal.clone().applyQuaternion(gq);          // world-space surface normal
        // front side = the surface normal faces the camera's direction from the globe's centre (not the camera's position minus a
        // point at 1.02 R — in the deep zoom the camera is closer than that and every label went dark; 16 Sep 2026)
        const toCam = camWorld.clone().normalize();
        L.el.style.opacity = (wn.dot(toCam) > 0.12 ? worldA * (L.late ? smooth(0.86, 0.95, p) : 1 - arcsGone) : 0).toFixed(3);
      }
    }
  
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  
  function __resize(){
    const w = host.clientWidth, h = host.clientHeight; if(!w||!h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    kinHostR = host.getBoundingClientRect(); kinStageR = stage.getBoundingClientRect();   // refresh the cache worldToStagePx() uses
  }
  // CIPS/site fix (15 Sep 2026): in this page's layout, `host` can still be 0×0 at mount — before layoutGroups() has
  // finished sizing the pinned group — and the runtime's own resize() (called once, right after mount) then found the
  // canvas at 0×0 permanently, since __resize() bails out on a zero size and nothing ever called it again. A
  // ResizeObserver fires once immediately on whatever size the host has right now, and again the moment it actually
  // becomes non-zero, so this self-corrects regardless of exactly when that happens.
  if ('ResizeObserver' in window) new ResizeObserver(() => __resize()).observe(host);

  boot();
  
  return {
    update(p){ __p = p; tick(performance.now()); },
    resize: __resize,
    destroy(){ if (voyageScrollLocked) document.body.style.overflow = ''; live?.destroy?.(); renderer.dispose(); },   // safety net: never leave the whole page scroll-locked if this beat is torn down mid-lock
    exit(){
      // measureEnd(): project the final frame (p = 1: globe = ciFacingQuat, camera at NEAR_Z) with the CURRENT host size,
      // so the next beat can open on exactly the same picture — the dot's stage pixel, the scale, and which way north points.
      const measureEnd = () => {
        const w = host.clientWidth || stage.clientWidth, h = host.clientHeight || stage.clientHeight;
        if (ciFacingQuat.lengthSq() === 0 || (ciFacingQuat.x === 0 && ciFacingQuat.y === 0 && ciFacingQuat.z === 0)) computeCIFacing();
        const cam = new THREE.PerspectiveCamera(CFG.fov, w / h, 0.1, 100); cam.position.set(0, 0, NEAR_Z); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        const gx = w * 0.02;   // --gx: the host is shifted right by 2vw
        const toScreen = (lng, lat, r = CFG.radius * 1.004) => { const v = lonLatToVec3(lng, lat, r).applyQuaternion(ciFacingQuat).project(cam); return { x: (v.x + 1) / 2 * w + gx, y: (1 - v.y) / 2 * h }; };
        const dot = toScreen(CI.lng, CI.lat), nth = toScreen(CI.lng, CI.lat + 0.2), est = toScreen(CI.lng + 0.2, CI.lat);
        const pxPerDegLat = Math.hypot(nth.x - dot.x, nth.y - dot.y) / 0.2, pxPerDegLng = Math.hypot(est.x - dot.x, est.y - dot.y) / 0.2;
        const northDeg = Math.atan2(nth.x - dot.x, -(nth.y - dot.y)) * 180 / Math.PI;   // screen bearing of north, clockwise from straight up (CSS sense)
        const dotPx = CFG.endpointSize * (h / 2) / (NEAR_Z - CFG.radius * 1.004);       // three.js point size on screen
        return { w, h, dot, pxPerDegLat, pxPerDegLng, northDeg, dotPx };
      };
      //   globe quaternion = ciFacingQuat  → CI_CENTER faces the camera at the host centre (host is shifted right by --gx = gxVw vw)
      //   camera at NEAR_Z on the z-axis, fov CFG.fov; the globe is rolled by CI_OFFSET about the view axis (three +z = counter-clockwise on screen)
      //   the Channel Islands endpoint dot (CI) is a Points sprite of size CFG.endpointSize → on screen ≈ size · (H/2) / (NEAR_Z − radius) px
      return { place: 'jersey', chart: true, ship: live?.selected ? { mmsi: live.selected.mmsi, name: live.selected.name, type: live.selected.type } : null,
        globeEnd: { measure: measureEnd, anchor: { lat: CI_CENTER.lat, lng: CI_CENTER.lng }, dot: { lat: CI.lat, lng: CI.lng },
                    nearZ: NEAR_Z, radius: CFG.radius, fov: CFG.fov, gxVw: 2, rollDeg: CI_OFFSET * 180 / Math.PI,
                    dotSize: CFG.endpointSize, dotColor: '#' + CFG.endpointColor.toString(16).padStart(6, '0') } };
    }
  };
}
