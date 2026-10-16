// Runtime numeric bounds from upstream v0.3.0, computed from the retained official tables.
import { dataBound } from './limits.js';
import { TEXT_COUNT_PATTERNS } from './textPatterns.js';
import { textFinite } from './textNumber.js';

/**
 * Tables walked for both the maximum and the check. choices, garrisons and tokens are included so a higher
 * official value is not missed; that only loosens a cap. [ASSUMED]
 */
export const BOUND_TABLES = Object.freeze([
  'chess', 'backups', 'enemies', 'bands', 'bonds', 'effects', 'items', 'waves', 'choices', 'garrisons', 'tokens',
]);

/** Skill fields that schedule charges or repeats. Durations and cooldowns are not in this list. */
const SKILL_FIELDS = Object.freeze(['spCost', 'initSp', 'maxChargeTime', 'increment', 'charges', 'maxCharges']);
const ENEMY_SP_FIELDS = Object.freeze(['maxSp', 'initSp', 'increment']);

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @type {object|null} */
let cachedSource = null;
/**
 * @type {{ bb: Map<string, number>, fields: Map<string, number>, bbMin: Map<string, number>,
 *   fieldMin: Map<string, number>, text: Map<string, number> }|null}
 */
let cached = null;

function bump(map, key, abs) {
  const prev = map.get(key);
  if (prev == null || abs > prev) map.set(key, abs);
}

function bumpMin(map, key, value) {
  if (!(value > 0)) return;
  const prev = map.get(key);
  if (prev == null || value < prev) map.set(key, value);
}

function emitBb(bb, path, fn) {
  if (Array.isArray(bb)) {
    bb.forEach((row, i) => {
      if (isPlain(row) && typeof row.key === 'string' && typeof row.value === 'number' && Number.isFinite(row.value)) {
        fn({ kind: 'bb', key: row.key, value: row.value, path: `${path}[${i}].value` });
      }
    });
    return;
  }
  if (!isPlain(bb)) return;
  for (const [k, v] of Object.entries(bb)) {
    if (typeof v === 'number' && Number.isFinite(v)) fn({ kind: 'bb', key: k, value: v, path: `${path}.${k}` });
    else if (v && typeof v === 'object') emitBb(v, `${path}.${k}`, fn);
  }
}

function isSkill(node) {
  return typeof node.skillId === 'string' || typeof node.prefabKey === 'string' || typeof node.skillType === 'string';
}

function isEnemySp(node, table) {
  return isPlain(node.sp) && (table === 'enemies' || table === 'waves') && (isPlain(node.stats) || table === 'waves');
}

function visit(node, table, path, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => visit(v, table, `${path}[${i}]`, fn));
    return;
  }
  if (node.bb && typeof node.bb === 'object') emitBb(node.bb, `${path}.bb`, fn);
  if (Array.isArray(node.blackboard)) emitBb(node.blackboard, `${path}.blackboard`, fn);
  if (isSkill(node)) {
    for (const k of SKILL_FIELDS) {
      const v = node[k];
      if (typeof v === 'number' && Number.isFinite(v)) fn({ kind: 'field', field: `skill.${k}`, value: v, path: `${path}.${k}` });
    }
  }
  if (isEnemySp(node, table)) {
    for (const k of ENEMY_SP_FIELDS) {
      const v = node.sp[k];
      if (typeof v === 'number' && Number.isFinite(v)) fn({ kind: 'field', field: `enemy.sp.${k}`, value: v, path: `${path}.sp.${k}` });
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'bb' || k === 'blackboard' || k === 'sp') continue;
    if (v && typeof v === 'object') visit(v, table, `${path}.${k}`, fn);
  }
}

function scanText(data) {
  const text = new Map();
  const walk = (node) => {
    if (typeof node === 'string') {
      for (const p of TEXT_COUNT_PATTERNS) {
        const n = textFinite(node, p.re, NaN);
        if (Number.isFinite(n) && n >= 0) bump(text, p.id, n);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  for (const table of BOUND_TABLES) walk(data?.[table]);
  return text;
}

function scan(data) {
  const bb = new Map();
  const fields = new Map();
  const bbMin = new Map();
  const fieldMin = new Map();
  for (const table of BOUND_TABLES) {
    visit(data?.[table], table, table, (ev) => {
      if (ev.kind === 'bb') {
        bump(bb, ev.key, Math.abs(ev.value));
        bumpMin(bbMin, ev.key, ev.value);
      } else {
        bump(fields, ev.field, Math.abs(ev.value));
        bumpMin(fieldMin, ev.field, ev.value);
      }
    });
  }
  return { bb, fields, bbMin, fieldMin, text: scanText(data) };
}

function emptyBounds() {
  return { bb: new Map(), fields: new Map(), bbMin: new Map(), fieldMin: new Map(), text: new Map() };
}

/**
 * Cache official maxima for `data`. The same object is not scanned again. A different object replaces the cache.
 * @param {object} data vanilla tables (getData() or the content set's base)
 */
export function rememberOfficialBounds(data) {
  if (!data || typeof data !== 'object') {
    cachedSource = null;
    cached = emptyBounds();
    return cached;
  }
  if (cachedSource === data && cached) return cached;
  cached = scan(data);
  cachedSource = data;
  return cached;
}

/** Drop the cache (server/data.js resetData). The next read uses the floor until remember runs again. */
export function forgetOfficialBounds() {
  cachedSource = null;
  cached = null;
}

function current() {
  return cached;
}

/** Official absolute maximum of a blackboard key, or null when the cached tables never use it. */
export function officialBbMax(key) {
  const map = current()?.bb;
  return map && map.has(key) ? map.get(key) : null;
}

/** Official absolute maximum of a loop field (`enemy.sp.maxSp`, `skill.spCost`, …), or null. */
export function officialFieldMax(name) {
  const map = current()?.fields;
  return map && map.has(name) ? map.get(name) : null;
}

/** Runtime cap for a blackboard key. Call at use time: the cache may be filled after import. */
export function bbCap(key) {
  return dataBound(officialBbMax(key));
}

/** Runtime cap for a documented loop field. */
export function fieldCap(name) {
  return dataBound(officialFieldMax(name));
}

/** Official maximum of a description-text count pattern, or null when vanilla text never matches it. */
export function officialTextMax(patternId) {
  const map = current()?.text;
  return map && map.has(patternId) ? map.get(patternId) : null;
}

/**
 * Smallest positive official value of a blackboard key, else of a loop field, else 0.
 * Step floors use this so an official interval below one tick is not raised.
 */
export function officialPositiveMin(key) {
  const c = current();
  if (!c || typeof key !== 'string') return 0;
  if (c.bbMin && c.bbMin.has(key)) return c.bbMin.get(key);
  if (c.fieldMin && c.fieldMin.has(key)) return c.fieldMin.get(key);
  return 0;
}
