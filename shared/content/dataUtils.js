// Mode configuration merge from upstream v0.3.0.
export const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const clone = v => Array.isArray(v) ? v.map(clone) : object(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;

export function mergeData(base, changes) {
  const out = { ...base };
  for (const [k, v] of Object.entries(changes)) out[k] = object(v) && object(base?.[k]) ? mergeData(base[k], v) : clone(v);
  return out;
}

export const RECORD_MAPS = Object.freeze({
  chess: ['chess_x', 'chessId'], enemies: ['enemy_x', 'key'], items: ['item_x', 'id'],
  bands: ['band_x', 'bandId'], garrisons: ['garrison_x', 'garrisonId'], effects: ['effect_x', 'effectId'],
  waves: ['wave_x', 'id'], stages: ['stage_x', 'id'], tokens: ['token_x', 'tokenId'],
});
