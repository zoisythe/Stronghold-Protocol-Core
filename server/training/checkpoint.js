// Restore mutable gameplay objects in place: scheduler callbacks keep referring
// to the same match/player objects. Immutable catalogues and code are shared.
const STATIC = new Set(['data', 'raw', 'gd', 'ds', 'registry', 'log', 'opts']);

export function checkpoint(match) {
  const records = [];
  const random = new Map();
  const seen = new Set();
  const visit = (obj) => {
    if (typeof obj === 'function') {
      if (typeof obj.state === 'function' && typeof obj.restore === 'function') random.set(obj, obj.state());
      return;
    }
    if (!obj || typeof obj !== 'object' || seen.has(obj) || Object.isFrozen(obj)) return;
    if (obj instanceof WeakMap || obj instanceof WeakSet) return;
    seen.add(obj);
    if (obj instanceof Map) {
      const entries = [...obj]; records.push(() => { obj.clear(); for (const [k, v] of entries) obj.set(k, v); });
      for (const [k, v] of entries) { visit(k); visit(v); }
    } else if (obj instanceof Set) {
      const entries = [...obj]; records.push(() => { obj.clear(); for (const v of entries) obj.add(v); });
      for (const v of entries) visit(v);
    } else {
      const descriptors = Object.getOwnPropertyDescriptors(obj);
      records.push(() => {
        for (const k of Reflect.ownKeys(obj)) if (!Object.hasOwn(descriptors, k)) delete obj[k];
        Object.defineProperties(obj, descriptors);
      });
      for (const [k, d] of Object.entries(descriptors)) if (!STATIC.has(k) && 'value' in d) visit(d.value);
    }
  };
  visit(match);
  return () => {
    for (let i = records.length - 1; i >= 0; i--) records[i]();
    for (const [rng, state] of random) rng.restore(state);
  };
}
