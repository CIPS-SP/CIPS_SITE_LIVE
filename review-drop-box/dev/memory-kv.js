// A stand-in for Cloudflare KV that lives in memory, for local testing only.
// Mirrors the parts of the KV API the drop box uses: get, put (with expirationTtl), delete, list.
export function memoryKV(clock = () => Date.now()) {
  const map = new Map(); // key -> { value, expires }
  const live = (k) => {
    const e = map.get(k);
    if (!e) return null;
    if (e.expires && e.expires <= clock()) { map.delete(k); return null; }
    return e;
  };
  return {
    async get(k) { const e = live(k); return e ? e.value : null; },
    async put(k, value, opts = {}) {
      map.set(k, { value: String(value), expires: opts.expirationTtl ? clock() + opts.expirationTtl * 1000 : 0 });
    },
    async delete(k) { map.delete(k); },
    async list({ prefix = '', limit = 1000 } = {}) {
      const names = [...map.keys()].filter((k) => k.startsWith(prefix) && live(k)).sort();
      return { keys: names.slice(0, limit).map((name) => ({ name })), list_complete: names.length <= limit };
    },
    _size: () => map.size,
  };
}
