// The mini-games' leaderboard (24 Nov 2026, Simon: option B). At the end of a game the player may add three initials (A to Z only, like an arcade)
// and their kind of vessel; nothing else is kept (no name, no address, no identifier). Top 10 per game, this week and all time. Simon can hide an entry
// from the /stats page. A determined person could fake a score: the box refuses impossible ones (over the game's maximum, or played faster than
// the game allows) and limits how many any one connection can send in an hour; a game leaderboard cannot be made cheat-proof.
//
//   POST /api/score         public   text body, JSON {game, score, initials, vtype, secs} (from the site's own addresses only) -> the two top 10s
//   GET  /api/leaderboard   public   ?game=approaches|line|berth|journey -> {week:[...], all:[...]}
//   GET  /stats/hide?id=N   Simon    hides an entry (same password as /stats)

export const GAMES = {
  approaches: { name: 'The Approaches', max: 1000, minSecs: 45 },
  line: { name: 'Hold the Line', max: 1000, minSecs: 15 },
  berth: { name: 'The Berthing', max: 1000, minSecs: 10 },
  journey: { name: 'Port Call Score (all three)', max: 3000, minSecs: 90 },
};
export const VTYPES = { yacht: 'Yacht', cruise: 'Cruise', offshore: 'Offshore', shipping: 'Shipping', other: 'Other' };
export const PER_HOUR = 12;
// three-letter words that must not go on a public board
const BLOCK = new Set(['ASS', 'CUM', 'FAG', 'FUC', 'FUK', 'FKU', 'KKK', 'NAZ', 'NIG', 'SEX', 'TIT', 'WTF', 'DIK', 'DIC', 'COK', 'JEW', 'GAY', 'PIS', 'POO', 'SHT', 'VAG', 'XXX', 'ANL', 'FCK', 'KYS', 'RAP', 'HOE', 'CNT', 'TWT', 'BUM']);

export function parseScore(text) {
  let o; try { o = JSON.parse(String(text || '').slice(0, 500)); } catch (e) { return { error: 'bad' }; }
  if (!o || typeof o !== 'object') return { error: 'bad' };
  const g = GAMES[o.game]; if (!g) return { error: 'game' };
  const score = Number(o.score); if (!Number.isInteger(score) || score < 0 || score > g.max) return { error: 'score' };
  const initials = String(o.initials || '').toUpperCase(); if (!/^[A-Z]{3}$/.test(initials)) return { error: 'initials' };
  if (BLOCK.has(initials)) return { error: 'initials' };
  const vtype = Object.prototype.hasOwnProperty.call(VTYPES, o.vtype) ? o.vtype : null; if (!vtype) return { error: 'vtype' };
  const secs = Number(o.secs); if (!Number.isFinite(secs) || secs < g.minSecs) return { error: 'quick' };
  return { game: o.game, score, initials, vtype };
}
