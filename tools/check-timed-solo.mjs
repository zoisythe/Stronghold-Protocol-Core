// Focused real-Env acceptance for opt-in multiplayer timing in solo training.
import assert from 'node:assert/strict';
import { Env } from '../server/training/Env.js';
import { GameData } from '../server/match/gamedata.js';
import { modeIdFor } from '../shared/constants.js';

const base = { mode: 'solo', difficulty: 'NORMAL', bot_rehearsal: 0, strategy: { mode: 'fixed' } };
const untimed = new Env();
try {
  const initial = untimed.reset(42, base);
  assert.equal(initial.observation.phase, 'PREP');
  assert.equal(initial.observation.deadline_ms, null);
  const after = untimed.step(0, { t: 'g.freeze' }, 65000);
  assert.equal(after.observation.round, 1);
  assert.equal(after.observation.deadline_ms, null);
} finally { untimed.close(); }

let moves = 0;
for (const difficulty of ['NORMAL', 'HARD', 'ABYSS']) {
  const env = new Env();
  try {
    const config = { ...base, difficulty, solo_timed: true };
    let state = env.reset(42, config);
    const multiplayer = new GameData(env.data, modeIdFor('coop', difficulty));
    for (let round = 1; round <= (multiplayer.hiddenRound ?? multiplayer.lastRound); round++) {
      assert.equal(env.match.gd.prepTime(round), multiplayer.prepTime(round));
    }
    assert.equal(state.observation.deadline_ms, 65000);
    if (difficulty !== 'NORMAL') continue;
    const beforeAdvice = env.observe();
    const advice = env.teacher_action();
    assert(advice && env.legal_actions().some((action) => JSON.stringify(action) === JSON.stringify(advice)));
    assert.deepEqual(env.observe(), beforeAdvice, 'Teacher advice must preserve the timed public state');
    state = env.step(0, { t: 'g.buy', slot: 0 }, 500);
    assert.equal(state.observation.deadline_ms, 64500);
    const firstMoves = env.legal_actions().filter((a) => a.t === 'g.move' && a.to.area === 'board');
    assert(firstMoves.length > 1, 'First bought chess must have multiple legal placements');
    const destinations = [firstMoves[0], firstMoves.at(-1)];
    while (state.observation.round === 1 && !state.terminated) {
      state = env.step(0, destinations[moves % 2], 1500);
      assert(!state.error, state.error);
      moves++;
      assert(moves <= 43, 'Preparation must expire after its original multiplayer limit');
    }
    assert.equal(moves, 43);
    assert(state.terminated || state.observation.round > 1, 'Expiry must run a genuine battle');
    assert(state.observation.self.stats.leaks > 0 || state.observation.self.stats.kills > 0);
    const replay = new Env();
    try {
      replay.reset(42, config);
      replay.step(0, { t: 'g.buy', slot: 0 }, 500);
      let replayed;
      for (let i = 0; i < moves; i++) replayed = replay.step(0, destinations[i % 2], 1500);
      assert.deepEqual(replayed, state);
    } finally { replay.close(); }
  } finally { env.close(); }
}

for (const value of [null, 0, 1, 'true']) {
  const env = new Env();
  try { assert.throws(() => env.reset(42, { ...base, solo_timed: value }), /solo_timed must be boolean/); }
  finally { env.close(); }
}
const draft = new Env();
try {
  const state = draft.reset(42, { ...base, strategy: { mode: 'model' }, solo_timed: true });
  assert.equal(state.observation.phase, 'BAND_DRAFT');
  assert.equal(state.observation.deadline_ms, 50000);
} finally { draft.close(); }
console.log(JSON.stringify({ pass: true, normal_prep_ms: 65000, move_ms: 1500,
  repeated_moves_before_real_battle: moves, same_difficulty_round_table: ['NORMAL', 'HARD', 'ABYSS'],
  replay: true, default_solo_untimed: true }));
