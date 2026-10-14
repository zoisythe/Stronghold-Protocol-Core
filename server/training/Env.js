import { Match } from '../match/Match.js';
import { VirtualScheduler } from '../match/scheduler.js';
import { getData } from '../data.js';
import { PHASE, DIFFICULTIES } from '../../shared/constants.js';
import { DIRS } from '../../shared/protocol.js';
import { FIELD, boardOrder } from '../match/board.js';
import { bondList, offBondCounts } from '../match/bondsMeta.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { botPickBand, botPickCard, botPrep } from '../match/bot.js';
import { checkpoint } from './checkpoint.js';
import { resolveSetup } from './setup.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter((k) => k !== 'source').map((k) => [k, canonical(value[k])])) : value;
const key = (action) => JSON.stringify(canonical(action));
const QUIET = { info() {}, warn() {}, debug() {}, error() {} };
const METHODS = {
  buy: (slot) => ({ t: 'g.buy', slot }), refresh: () => ({ t: 'g.refresh' }), freeze: () => ({ t: 'g.freeze' }),
  levelUp: () => ({ t: 'g.levelUp' }), sell: (uid) => ({ t: 'g.sell', uid }),
  move: (uid, to, dir) => ({ t: 'g.move', uid, to, ...(dir == null ? {} : { dir }) }),
  equip: (itemUid, targetUid, replaceUid) => ({ t: 'g.equip', itemUid, targetUid, ...(replaceUid == null ? {} : { replaceUid }) }),
  useArt: (itemUid, row, col, dir) => ({ t: 'g.art', itemUid, row, col, ...(dir == null ? {} : { dir }) }),
  destroy: (uid) => ({ t: 'g.destroy', uid }), pickReward: (idx) => ({ t: 'g.reward', idx }),
  setReady: (ready) => ({ t: 'g.ready', ready }),
};

export class Env {
  constructor({ data = null } = {}) { this.data = data || getData({ log: QUIET }); this.match = null; }

  reset(seed = 1, config = {}) {
    this.close();
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('seed must be uint32');
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('config must be an object');
    const mode = config.mode ?? 'solo';
    const difficulty = config.difficulty ?? 'NORMAL';
    const players = config.players ?? (mode === 'solo' ? 1 : 2);
    const controlled = config.controlled_seats ?? [0];
    if (!['solo', 'coop'].includes(mode) || !DIFFICULTIES.includes(difficulty)) throw new TypeError('invalid mode/difficulty');
    if (!Number.isInteger(players) || players < 1 || players > 4 || (mode === 'solo' && players !== 1)) throw new TypeError('invalid player count');
    if (!Array.isArray(controlled) || new Set(controlled).size !== controlled.length || controlled.some((s) => !Number.isInteger(s) || s < 0 || s >= players)) throw new TypeError('invalid controlled_seats');
    const rehearsal = config.bot_rehearsal ?? 3;
    if (!Number.isInteger(rehearsal) || rehearsal < 0 || rehearsal > 8) throw new TypeError('bot_rehearsal must be 0..8');
    this.seed = seed || 1; // Original Match seed normalisation.
    this.config = structuredClone(config);
    this.controlled = new Set(controlled);
    this.setups = resolveSetup(this.data, this.seed, config, players);
    this.history = [];
    this.revision = 0;
    this.advice = null;
    this.strategy = config.strategy ?? { mode: 'model' };
    if (!['model', 'fixed', 'random'].includes(this.strategy.mode ?? 'model')) throw new TypeError('invalid strategy mode');
    this.strategyRng = createRng(deriveSeed(this.seed, 'training-strategy'));
    this.scheduler = new VirtualScheduler({ onError: () => {} });
    const seats = this.setups.map((setup, seat) => ({ seat, playerId: `p_${seat}`, name: `P${seat + 1}`, isBot: !this.controlled.has(seat), connected: true, ...setup }));
    const m = this.match = new Match({ mode, difficulty, seats, seed: this.seed, data: this.data,
      scheduler: this.scheduler, log: QUIET, botRehearsal: rehearsal, clientCombat: false,
      aiPicksLast: config.ai_picks_last === true });
    // The original constructor excludes bot loadouts; training configuration may
    // explicitly supply them. Apply through the same checked setup methods.
    for (const ps of m.order) if (ps.isBot) {
      const s = this.setups[ps.seat];
      if (!ps.setLoadout(s.loadout, s.ops)) throw new Error('invalid bot loadout');
      ps.setNotOwned(s.notOwned); ps.setDiy(s.diy);
      ps.initDiyStock(new Set([...m.disabledBonds, ...m.staticInactiveBonds]));
    }
    this.bans = this._resolveBans();
    const originalTaken = m.bandTaken.bind(m);
    m.bandTaken = (id, pid) => this.bans.includes(id) || originalTaken(id, pid);
    const originalDefault = m.defaultBand.bind(m);
    m.defaultBand = (pid) => {
      const selected = originalDefault(pid);
      return this.bans.includes(selected) ? m.gd.bandIds().find((id) => !this.bans.includes(id) && !m.bandTaken(id, pid)) : selected;
    };
    // All game battles retain full content but allocate no rendering events.
    const construct = m.newBattle.bind(m);
    m.newBattle = (opts) => construct({ ...opts, recordEvents: false });
    m.start();
    this._pump();
    return { ...this._result(controlled[0] ?? 0), seed: this.seed, resolved_setup: copy(this.setups), strategy_bans: [...this.bans] };
  }

  _resolveBans() {
    const available = this.match.gd.bandIds();
    const given = this.strategy.bans ?? [];
    const count = this.strategy.ban_count ?? 0;
    if (!Array.isArray(given) || given.some((id) => !available.includes(id)) || new Set(given).size !== given.length || given.length > 3) throw new TypeError('strategy bans must contain at most three known unique ids');
    if (!Number.isInteger(count) || count < 0 || count > 3) throw new TypeError('strategy ban_count must be 0..3');
    if (this.strategy.fixed != null && !available.includes(this.strategy.fixed)) throw new TypeError('unknown fixed strategy');
    const bans = [...given];
    for (const id of this.strategyRng.shuffle(available.filter((id) => !bans.includes(id)))) {
      if (bans.length >= Math.max(given.length, count) || bans.length >= available.length - 1) break;
      bans.push(id);
    }
    if (bans.length >= available.length) throw new TypeError('strategy bans leave no candidate');
    return bans;
  }

  _check() {
    if (!this.match || this.match.disposed) throw new Error('environment is closed');
    const m = this.match;
    if (m.errorCount || m.simErrors || this.scheduler.errors.length || m.dispatcher.errors) {
      throw new Error(`engine failed: ${JSON.stringify(m.errors)} ${JSON.stringify([...m.simErrorLog.values()])}`);
    }
  }

  decision_seats() {
    const m = this.match;
    if (!m || m.ended) return [];
    return m.order.filter((ps) => this.controlled.has(ps.seat) && ps.alive && !ps.left && (
      (m.phase === PHASE.BAND_DRAFT && m.draftTurn() === ps.playerId && !m.draft.picks[ps.playerId]) ||
      (m.phase === PHASE.SP_DRAFT && m.spTurn() === ps.playerId && m.sp.picks[ps.playerId] == null) ||
      (m.phase === PHASE.PREP && !ps.ready)
    )).map((ps) => ps.seat);
  }

  _pump() {
    const m = this.match;
    for (let i = 0; i < 100000; i++) {
      this._check();
      if (m.ended) return;
      if (m.phase === PHASE.INFO_CHECK) {
        for (const ps of m.order) if (!ps.infoReady) m.handle(ps.playerId, { t: 'g.infoReady', setupRevision: m.setupRevision });
      }
      const at = this.scheduler.nextAt();
      if (at != null && at <= this.scheduler.now()) { this.scheduler.runNext(); continue; }
      const seats = this.decision_seats();
      if (m.phase === PHASE.BAND_DRAFT && seats.length && (this.strategy.mode ?? 'model') !== 'model') {
        const ps = m.order.find((p) => p.seat === seats[0]);
        const choices = m.gd.bandIds().filter((id) => !this.bans.includes(id) && !m.bandTaken(id, ps.playerId));
        const id = this.strategy.mode === 'random' ? this.strategyRng.pick(choices) :
          (choices.includes(this.strategy.fixed) ? this.strategy.fixed : m.defaultBand(ps.playerId));
        const result = m.handle(ps.playerId, { t: 'g.band', bandId: id });
        if (result.error) throw new Error(`automatic strategy failed: ${result.error}`);
        continue;
      }
      if (seats.length) return;
      if (at == null) throw new Error(`no decision or scheduled transition in ${m.phase}`);
      this.scheduler.runNext();
    }
    throw new Error('automatic transition limit exceeded');
  }

  _player(seat) {
    this._check();
    const ps = this.match.order.find((p) => p.seat === seat);
    if (!ps) throw new RangeError('unknown seat');
    return ps;
  }

  observe(seat = 0) {
    const ps = this._player(seat), m = this.match;
    const restore = checkpoint(m);
    try {
      const privateState = ps.privateView();
      delete privateState.t;
      return copy({ phase: m.phase, round: m.round, last_round: m.gd.lastRound, mode_id: m.modeId,
        difficulty: m.difficulty, stage_id: m.stageId, factions: m.factions, disabled_bonds: [...m.disabledBonds, ...m.staticInactiveBonds],
        deadline_ms: m.deadline ? Math.max(0, m.deadline - this.scheduler.now()) : null,
        deploy_field: m.deployFieldOf(ps), deploy_tiles: Object.fromEntries(ps.deployMap()),
        decision_seats: this.decision_seats(), self: privateState,
        teammates: m.order.filter((p) => p !== ps).map((p) => ({ seat: p.seat, alive: p.alive, lp: p.lp,
          band_id: p.bandId, level: p.shop.level, ready: p.ready, board: boardOrder(p.board).map(({ r, c, piece }) => p.pieceView(piece, [r, c])),
          bonds: p.alive ? bondList(m.gd, p.bondsView(), { off: offBondCounts(p.gd, p) }) : [] })),
        strategies: m.phase === PHASE.BAND_DRAFT ? m.gd.bandIds().filter((id) => !this.bans.includes(id) && !m.bandTaken(id, ps.playerId)) : [],
        draft: m.phase === PHASE.SP_DRAFT ? { cards: m.sp.cards, taken: m.sp.taken, turn: m.spTurn() } : null,
        terminated: m.ended, result: m.ended ? m.lastResultMsg : null });
    } finally { restore(); }
  }

  _perform(seat, action, elapsed) {
    const ps = this._player(seat);
    if (!this.controlled.has(seat)) return { error: 'NOT_CONTROLLED' };
    if (!action || typeof action !== 'object' || Array.isArray(action)) return { error: 'BAD_MSG' };
    if (action.t === 'g.wait') return elapsed > 0 && !this.match.ended ? { ok: true } : { error: 'BAD_MSG' };
    if (['g.band', 'g.bandFocus'].includes(action.t) && this.bans.includes(action.bandId)) return { error: 'BAD_TARGET', detail: 'strategy masked' };
    return this.match.handle(ps.playerId, action);
  }

  step(seat, action, elapsed_ms = 0) {
    this._player(seat);
    if (action?.t === 'g.wait' && elapsed_ms === 0) elapsed_ms = action.elapsed_ms ?? 0;
    if (!Number.isFinite(elapsed_ms) || elapsed_ms < 0) return { ...this._result(seat), error: 'BAD_ELAPSED' };
    const source = action?.source ?? (action?.t === 'g.wait' ? 'timeout' : 'model');
    if (!['model', 'teacher', 'timeout'].includes(source)) return { ...this._result(seat), error: 'BAD_SOURCE' };
    const restore = checkpoint(this.match);
    let res;
    try { res = this._perform(seat, action, elapsed_ms); }
    catch (error) { restore(); throw error; }
    if (res.error) { restore(); return { ...this._result(seat), ...res }; }
    this.history.push({ seat, action: structuredClone(action), elapsed_ms, source });
    this.revision++;
    if (this.advice?.seat === seat && this.advice.revision === this.revision - 1 && elapsed_ms === 0 && key(this.advice.actions[0]) === key(action)) {
      this.advice.actions.shift(); this.advice.revision = this.revision;
    } else this.advice = null;
    if (elapsed_ms > 0) this.scheduler.advance(elapsed_ms);
    this._pump();
    return this._result(seat);
  }

  _result(seat) {
    return { observation: this.observe(seat), decision_seats: this.decision_seats(), terminated: this.match.ended,
      metrics: copy({ round: this.match.round, outcome: this.match.outcome, players: this.match.order.map((ps) => ({ seat: ps.seat, lp: ps.lp, funds: ps.funds, stats: ps.stats })) }) };
  }

  *_candidates(ps) {
    const m = this.match;
    if (m.phase === PHASE.BAND_DRAFT) {
      for (const bandId of m.gd.bandIds()) if (!this.bans.includes(bandId)) {
        yield { t: 'g.band', bandId };
        yield { t: 'g.bandFocus', bandId };
      }
      yield { t: 'g.bandFocus', bandId: null };
      yield { t: 'g.bandSkip' };
      return;
    }
    if (m.phase === PHASE.SP_DRAFT) {
      for (const card of m.sp.cards) yield { t: 'g.choice', idx: card.idx };
      return;
    }
    if (m.phase !== PHASE.PREP) return;
    yield { t: 'g.ready', ready: !ps.ready };
    if (ps.ready) return;
    if (ps.personalChoice) for (let idx = 0; idx < ps.personalChoice.cards.length; idx++) yield { t: 'g.choice', idx, choiceId: ps.personalChoice.id };
    for (let slot = 0; slot < ps.shop.slots.length; slot++) yield { t: 'g.buy', slot };
    for (const t of ['g.refresh', 'g.freeze', 'g.levelUp']) yield { t };
    for (let idx = 0; idx < (ps.offers[0]?.slots.length ?? 0); idx++) yield { t: 'g.reward', idx };
    const pieces = [...ps.hand, ...ps.temp, ...ps.board.values()].filter(Boolean);
    for (const p of pieces) {
      if (p.kind === 'chess') yield { t: 'g.sell', uid: p.uid };
      if (p.kind === 'item') yield { t: 'g.destroy', uid: p.uid };
      for (let idx = 0; idx < ps.hand.length; idx++) yield { t: 'g.move', uid: p.uid, to: { area: 'hand', idx } };
      if (p.kind !== 'item') for (let row = FIELD.r0; row <= FIELD.r1; row++) for (let col = FIELD.c0; col <= FIELD.c1; col++) for (const dir of DIRS) yield { t: 'g.move', uid: p.uid, to: { area: 'board', row, col }, dir };
      if (p.kind === 'item') {
        const rec = ps.gd.item(p.id);
        if (rec?.itemType === 'EQUIP') for (const target of pieces.filter((x) => x.kind === 'chess')) {
          yield { t: 'g.equip', itemUid: p.uid, targetUid: target.uid };
          if (target.items?.length >= 2) for (const item of target.items) yield { t: 'g.equip', itemUid: p.uid, targetUid: target.uid, replaceUid: item.uid };
        }
        if (rec?.itemType === 'MAGIC') for (let row = FIELD.r0; row <= FIELD.r1; row++) for (let col = FIELD.c0; col <= FIELD.c1; col++) for (const dir of DIRS) yield { t: 'g.art', itemUid: p.uid, row, col, dir };
      }
    }
  }

  legal_actions(seat = 0) {
    const ps = this._player(seat);
    if (this.match.ended || !this.controlled.has(seat) || !ps.alive) return [];
    const candidates = [...this._candidates(ps)];
    const restore = checkpoint(this.match);
    const actions = [];
    try {
      for (const action of candidates) {
        const result = this._perform(seat, action, 0);
        if (!result.error) actions.push(action);
        restore();
      }
    } finally { restore(); }
    if (this.decision_seats().includes(seat) && this.match.deadline) actions.push({ t: 'g.wait', elapsed_ms: this.match.deadline - this.scheduler.now() });
    return actions;
  }

  teacher_action(seat = 0) {
    const ps = this._player(seat);
    if (!this.decision_seats().includes(seat)) return null;
    if (this.advice?.seat === seat && this.advice.revision === this.revision && this.advice.actions.length) return copy(this.advice.actions[0]);
    const shadow = new Env({ data: this.data });
    try {
      shadow.reset(this.seed, this.config);
      for (const event of this.history) {
        const result = shadow.step(event.seat, event.action, event.elapsed_ms);
        if (result.error) throw new Error(`shadow replay refused ${result.error}`);
      }
      const m = shadow.match, player = shadow._player(seat);
      const actions = [];
      // Original bot planning may consume its private tie-breaking RNG, never
      // the real match's bot stream or a teammate's stream.
      m.rngBots = createRng(deriveSeed(this.seed, `teacher:${seat}:${this.revision}`));
      if (m.phase === PHASE.BAND_DRAFT) {
        let bandId = botPickBand(m, player);
        const options = m.gd.bandIds().filter((id) => !this.bans.includes(id) && !m.bandTaken(id, player.playerId));
        if (!options.includes(bandId)) bandId = options[0];
        actions.push({ t: 'g.band', bandId });
      } else if (m.phase === PHASE.SP_DRAFT) {
        const available = m.sp.cards.filter((c) => m.spCardAvailable(c)).map((c) => c.idx);
        actions.push({ t: 'g.choice', idx: botPickCard(m, player, m.sp.cards, available) });
      } else if (m.phase === PHASE.PREP) {
        let depth = 0;
        for (const [name, encode] of Object.entries(METHODS)) {
          const original = player[name].bind(player);
          player[name] = (...args) => {
            const outer = depth++ === 0;
            try { const result = original(...args); if (outer && result?.ok) actions.push(encode(...args)); return result; }
            finally { depth--; }
          };
        }
        const personal = m.pickPersonalChoice.bind(m);
        m.pickPersonalChoice = (p, idx, choiceId) => {
          const result = personal(p, idx, choiceId);
          if (p === player && result?.ok && depth === 0) actions.push({ t: 'g.choice', idx, choiceId });
          return result;
        };
        botPrep(m, player);
        shadow._check();
      }
      if (!actions.length) throw new Error('teacher produced no legal action');
      this.advice = { seat, revision: this.revision, actions: copy(actions) };
      return copy(actions[0]);
    } finally { shadow.close(); }
  }

  debug_state() {
    this._check();
    const m = this.match;
    return copy({ seed: this.seed, revision: this.revision, phase: m.phase, round: m.round,
      time_ms: this.scheduler.now(), uid: m.uidSeq, setup: this.setups, history: this.history,
      random: Object.fromEntries(['Setup', 'Shop', 'Waves', 'Draft', 'Bots', 'Meta'].map((name) => [name, m[`rng${name}`].state()])),
      pool: [...m.pool.entries], item_pool: [...m.itemPool.entries ?? []],
      players: m.order.map((ps) => ({ seat: ps.seat, hand: ps.hand, temp: ps.temp, board: [...ps.board], funds: ps.funds, lp: ps.lp, layers: ps.layers, counters: ps.counters })), outcome: m.outcome });
  }

  close() { if (this.match) this.match.dispose(); this.match = null; this.advice = null; }
}
