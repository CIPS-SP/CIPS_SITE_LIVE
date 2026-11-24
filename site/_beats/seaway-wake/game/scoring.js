// The Approaches' points (24 Nov 2026, Simon). Stars stay the main measure and are easy to earn (arrival-rules.js); the points
// are hard to max out and feed the leaderboard. Out of 1,000, like the other two games:
//   Clean passage 250 · Radio 200 · Orders with Simon 150 · Getting the pilot launch 250 · Dolphins 150
// (Simon set the other four; the 50 left over went to the clean passage, 24 Nov 2026: one number to change if he wants it elsewhere.)
export const SCENE_MAX = 1000;
const clampTo = (n, max) => Math.max(0, Math.min(max, Math.round(n)));
// full marks up to `full` seconds, then a straight line down to 0 at `zero` seconds
const taper = (t, max, full, zero) => (t == null ? 0 : t <= full ? max : clampTo((max * (zero - t)) / (zero - full), max));
function firstTime(log, event) { const m = log.find(e => e.event === event); return m ? m.time : null; }

// what each time the pilot had to step in costs off the clean passage
export const ASSIST_COST = { dfds: 80, ropax: 80, cruise: 80, iu: 80, dolphin: 60, live: 60, tuna: 40, potter: 40, superyacht: 40, trawler: 40, openboat: 40, racer: 40, tender: 40, lifeboat: 40, cgrib: 40, shore: 40, pilotOff: 40, taxi: 30, pots: 20 };
const OTHER_ORDERS = ['taxi', 'crew', 'pilot', 'hamper'];   // the "two other things" ordered from Simon, besides fuel and stores

export function sceneScore(S, calls, cfg) {
  const log = S.pilotBoardingLog || [];
  const tasks = [
    { id: 'clean', label: 'Clean passage', max: 250,
      criteria: 'Starts at 250. Each time the pilot has to step in costs points: a ferry 80, a dolphin 60, a tuna boat 40, the water taxi 30, the pots 20.',
      score: clampTo(250 - (S.assists || []).reduce((sum, k) => sum + (ASSIST_COST[k] ?? 40), 0), 250) },
    { id: 'notice', label: "1 hr's notice to VTS", max: 200,
      criteria: 'Full 200 if given within 5 s of getting under way, then 13 points less each second, nothing by 20 s. Nothing if VTS had to log it for you.',
      score: S.noticeAuto || S.noticeAt == null ? 0 : taper(S.noticeAt, 200, 5, 20) },
    { id: 'stores', label: 'Orders with Simon', max: 150,
      criteria: 'Fuel 50, stores 50, then 25 for each other thing (water taxi, crew, pilot, hamper), up to two.',
      score: (() => { const stores = Array.isArray(calls.stores) ? calls.stores.length : 0;
        const others = OTHER_ORDERS.filter(k => k === 'hamper' ? !!calls.hamper : calls[k] === true).length;
        return clampTo((calls.fuel ? 50 : 0) + (stores ? 50 : 0) + 25 * Math.min(2, others), 150); })() },
    { id: 'onStation', label: 'Getting the pilot launch', max: 250,
      criteria: 'Timed from entering the pilot zone to the launch\'s call (speed and heading right): full 250 within 8 s, then down to nothing at 53 s.',
      score: (() => { const e = S.enteredStationAt, o = firstTime(log, 'onStation');
        return taper(e != null && o != null ? Math.max(0, o - e) : null, 250, 8, 53); })() },
    { id: 'dolphins', label: 'Dolphins', max: 150,
      criteria: '5 points for every second the dolphins ride the wake, up to 150 (30 seconds). A hard helm or the wrong speed sends them off.',
      score: clampTo(5 * (S.wakeRideT || 0), 150) },
  ];
  return { tasks, total: tasks.reduce((sum, x) => sum + x.score, 0), max: SCENE_MAX };
}
// kept for code that still reads it (the finishing card's "/ 1000" per row now uses each task's own max)
export const MAX_TASK_SCORE = 1000;
