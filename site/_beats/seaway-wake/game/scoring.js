// 26 Sep 2026, Simon: "stars plus scores... separately" — the star stays "did you do it" (arrival-rules.js);
// this is "how well", a skill score behind each of the same five tasks, added up on the finishing card and as a
// running total in the arrival notes. First pass: each benchmark is dead reckoned from the game's own already-
// tuned numbers where a genuine best-possible time exists (pilot-boarding.js's constants, mostly), not measured
// from real play yet — worth Simon's own feel for whether they're too harsh or too soft.
// Deliberately NOT here yet (agreed, hold for later): a leaderboard, and the multi-scene scorecard this scene's
// score would eventually feed into — both need a scene that doesn't exist yet to make sense of.
export const MAX_TASK_SCORE = 1000;
const clampScore = n => Math.max(0, Math.min(MAX_TASK_SCORE, Math.round(n)));
// full marks at `best` (the real fastest a task can be done), 0 by `zeroAt`, straight-line between
const decay = (t, best, zeroAt) => (t == null ? 0 : clampScore((MAX_TASK_SCORE * (zeroAt - t)) / (zeroAt - best)));
function firstTime(log, event) { const m = log.find(e => e.event === event); return m ? m.time : null; }

export function sceneScore(S, calls, cfg) {
  const log = S.pilotBoardingLog || [];
  const tasks = [
    // 1. 1 hr's notice — VHF 82, as early as possible; the port logging it for you (S.noticeAuto) scores nothing,
    // same as it earns no star.
    { id: 'notice', label: "1 hr's notice sent",
      criteria: 'Full marks for calling it within 2s of getting under way; nothing left by 14s, and nothing at all if the port logged it for you.',
      score: S.noticeAuto || S.noticeAt == null ? 0 : decay(S.noticeAt, 2, 14) },
    // 2. Provisions and bunkers — completeness, not speed: nothing in the game times this one, so the "how well"
    // here is a generous order (both arranged, several items, a hamper too) rather than a race.
    { id: 'stores', label: 'Provisions and bunkers',
      criteria: 'Order both fuel and stores for full marks; a hamper and 3+ store items on top of that.',
      score: (() => { const stores = Array.isArray(calls.stores) ? calls.stores.length : 0;
        if (!stores || !calls.fuel) return 0;
        return clampScore(700 + (calls.hamper ? 200 : 0) + (stores >= 3 ? 100 : 0)); })() },
    // 3. On station for the pilot — from the moment she's actually waiting on you (not the fixed ~3.2s she takes
    // to come up from astern first) to holding speed/heading long enough. 1.25s is advanceBoarding's own real
    // stability requirement — she can't call it any sooner, however ready you already are.
    { id: 'onStation', label: 'On station for the pilot',
      criteria: "Full marks for holding speed and course within 1.25s of the launch coming up astern — the pilot's own fastest read of it.",
      score: (() => { const w = firstTime(log, 'waiting'), o = firstTime(log, 'onStation');
        return decay(w != null && o != null ? o - w : null, 1.25, 8); })() },
    // 4. Dolphins — ambient, not a race: nothing here to time or grade finer than the criterion itself.
    { id: 'dolphins', label: 'Dolphins joined us', criteria: 'All or nothing — full marks if they ride the wake at any point, nothing if they never turn up.', score: S.wakeDolphins ? MAX_TASK_SCORE : 0 },
    // 5. Pilot aboard — Simon's own example. 28 Sep 2026: "speed of the tap should not be the only variable, it
    // should be how many s after entering the pilot boarding area... whatever the theoretical quickest is should
    // be 1000pts, decaying thereafter" — was timed from the tap-timing actually starting (BOARDING_TRANSFER_S,
    // 2.2s, the fastest a *landed* tap can transfer), ignoring everything before that. Now timed from
    // S.enteredStationAt (game.js: the first tick she's within BOARDING_ZONE_UNITS of the pilot boarding place)
    // to boarded — the whole job, not just the last 2.2s of it. 11.35s is not a hand guess: scripted the ideal
    // run through the debug hook (full ahead to close the distance, settle to 7kt/100° the instant she's in the
    // zone, tap the first safe moment) three times, identical each time — the pilot's own sequencing (the launch's
    // fixed 'out' hold, the 1.25s stability check, BOARDING_CLOSE_S, BOARDING_TRANSFER_S) leaves no faster path.
    { id: 'pilot', label: 'Pilot aboard',
      criteria: 'Full marks for boarding within 11.35s of entering the pilot boarding area — the theoretical fastest the sequence allows — decaying thereafter.',
      score: (() => { const e = S.enteredStationAt, a = firstTime(log, 'aboard');
        return decay(e != null && a != null ? a - e : null, 11.35, 21.35); })() },
  ];
  return { tasks, total: tasks.reduce((sum, x) => sum + x.score, 0), max: tasks.length * MAX_TASK_SCORE };
}
