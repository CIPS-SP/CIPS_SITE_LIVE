// A stand-in for the Durable Object that keeps the journey counts, the problem reports and the leaderboard (src/counts.js), for the local test
// server only. 24 Nov 2026: it runs the real Counter class on Node's own SQLite (in memory), so the local server behaves exactly like the live box.
import { DatabaseSync } from 'node:sqlite';
import { Counter } from '../src/counts.js';
export function memoryCounter() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec: (q, ...args) => { const st = db.prepare(q); const rows = /^\s*select/i.test(q) ? st.all(...args) : (st.run(...args), []); return { toArray: () => rows }; } };
  const counter = new Counter({ storage: { sql } });
  const stub = { fetch: (u) => counter.fetch(new Request(u)) };
  return { idFromName: () => 'journey', get: () => stub };
}
