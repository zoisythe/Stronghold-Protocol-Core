import { versionOfData } from '../../shared/versions.js';
import { getBotStrategy } from './botStrategies.js';
import { PHASE, modeIdFor } from '../../shared/constants.js';
import { Battle } from '../sim/Battle.js';
import { DataSource } from '../sim/simdata.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { GameData } from './gamedata.js';
import { VirtualScheduler } from './scheduler.js';
import { SharedPool, SharedItemPool, drawDisabledBonds } from './pool.js';
import { PlayerState } from './PlayerState.js';
import { EffectDispatcher, getDefaultRegistry } from './effectsMeta.js';
import { setupMatchWaves } from './waves.js';
import { GAME_SPEED, HEADLESS_SLICE_MS } from './fields.js';
import { MatchPlatform } from './match/platform.js';
import { MatchInfra } from './match/infra.js';
import { MatchMessaging } from './match/messaging.js';
import { MatchViews } from './match/views.js';
import { MatchIntents } from './match/intents.js';
import { MatchPhases } from './match/phases.js';
import { MatchSpDraft } from './match/spDraft.js';
import { MatchPrep } from './match/prep.js';
import { MatchCombat } from './match/combat.js';
import { MatchUnite } from './match/unitePhase.js';
import { MatchBoss } from './match/bossRounds.js';
import { MatchSettle } from './match/settle.js';

export { FLOW_TICKER_PRIORITY, DELAYS, BAND_TURN_SECONDS } from './match/common.js';

const BOT_REHEARSAL_DEFAULT = 3;
/** Wall-clock ms of bot layout rehearsal per scheduler callback (real time; virtual time runs it in one go). */
const BOT_SLICE_MS = 8;
const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

const dsCache = new WeakMap();
function dataSourceFor(data) {
  if (!data || typeof data !== 'object' || !data.chess) return undefined;
  let ds = dsCache.get(data);
  if (!ds) { ds = new DataSource(data, null); dsCache.set(data, ds); }
  return ds;
}

export class Match {
  /** @param {object} opts see MATCH INTERFACE above */
  constructor(opts) {
    if (!opts || !Array.isArray(opts.seats) || opts.seats.length === 0) throw new TypeError('Match: seats required');
    this.opts = opts;
    this.roomCode = opts.roomCode ?? '----';
    this.mode = opts.mode === 'solo' ? 'solo' : 'coop';
    this.difficulty = opts.difficulty;
    this.modeId = opts.modeId || modeIdFor(this.mode, opts.difficulty);
    this.seed = (Number(opts.seed) >>> 0) || 1;
    this.log = opts.log || noopLog;
    this.sendFn = opts.send || (() => true);
    this.broadcastFn = opts.broadcast || (() => {});
    this.onEndFn = opts.onEnd || (() => {});
    this.data = opts.data && typeof opts.data === 'object' ? opts.data : {};
    this.version = this.data.config?.version ? versionOfData(this.data) : null;
    if (!Object.hasOwn(this.data.config?.modes || {}, this.modeId)) throw new RangeError(`Mode ${this.modeId} is unavailable in ${versionOfData(this.data)}`);
    this.bot = getBotStrategy(opts.botStrategy);
    this.gd = new GameData(this.data, this.modeId);
    if (!this.difficulty) this.difficulty = this.gd.difficulty;
    this.isSolo = this.mode === 'solo' || this.gd.isSolo;
    /** 「AI 队友最后选择」 (opts.aiPicksLast, GitHub #338): humans draft before AI seats (MatchPhases.humansFirst) */
    this.aiPicksLast = !this.isSolo && opts.aiPicksLast === true;
    this.ownsScheduler = !opts.scheduler;
    this.sched = opts.scheduler || new VirtualScheduler({ onError: (e) => this.reportError('timer', e) });
    this.registry = opts.registry || getDefaultRegistry();
    this.dispatcher = new EffectDispatcher(this, this.registry);
    this.BattleClass = typeof opts.BattleClass === 'function' ? opts.BattleClass : Battle;
    this.battleContent = opts.battleContent || 'full';
    this.timerScale = Number.isFinite(opts.timerScale) && opts.timerScale >= 0 ? opts.timerScale : 1;
    this.gameSpeed = Number.isFinite(opts.combatSpeed) && opts.combatSpeed > 0 ? Math.min(opts.combatSpeed, 200) : GAME_SPEED;
    /** layouts a bot rehearses per prep with the real simulation (bot.js; 0 = heuristic placement only) */
    this.botRehearsal = Number.isInteger(opts.botRehearsal) && opts.botRehearsal >= 0 ? Math.min(opts.botRehearsal, 8) : BOT_REHEARSAL_DEFAULT;
    /** wall-clock budget of one rehearsal slice (scheduleBotPrep) */
    this.botSliceMs = Number.isFinite(opts.botSliceMs) && opts.botSliceMs > 0 ? opts.botSliceMs : this.sched.virtual ? Infinity : BOT_SLICE_MS;
    this.ds = dataSourceFor(this.data);
    /** client-side combat (DESIGN §14) — see the header */
    this.clientCombat = false;
    this.verifyMode = 'off';
    /** wall-clock ms per slice of a server-run normal / 联防 field (virtual time: at once) */
    this.headlessSliceMs = Number.isFinite(opts.headlessSliceMs) && opts.headlessSliceMs > 0 ? opts.headlessSliceMs : this.sched.virtual ? Infinity : HEADLESS_SLICE_MS;
    this.verifyStats = { checked: 0, mismatches: 0, rejected: 0, takeovers: 0 };
    this._battleSeq = 0;
    /** solo pause (g.pause, DESIGN §14): the field clocks / deadlines are frozen while true (m.public.paused) */
    this.paused = false;
    this._pausedAt = 0;
    /** real ms spent paused this match (diagnostics) */
    this.pausedMs = 0;
    /** boss rounds (client-side combat): the throttled m.public refresh (_bossPublic) */
    this._bossPubTimer = null;
    this._bossPubAt = -Infinity;
    this._bossClockOn = false;
    /**
     * battleId prefix (DESIGN §14): the seed (+ the room's match number) — a b.progress / b.result that crossed into the
     * next match of the room (the same socket, the same field ids) never names a battle of this match.
     */
    this.battlePrefix = `${this.seed.toString(36)}${Number.isInteger(opts.matchNo) && opts.matchNo > 0 ? `-${opts.matchNo.toString(36)}` : ''}`;
    this._progressTimer = null;
    this._bossClock = null;
    this._lastPoolAt = -Infinity;
    this._poolTimer = null;
    this._lastPoolKey = '';
    this.pacer = null;

    const rng = (name) => createRng(deriveSeed(this.seed, name));
    this.rngSetup = rng('setup');
    this.rngShop = rng('shop');
    this.rngWaves = rng('waves');
    this.rngDraft = rng('draft');
    this.rngBots = rng('bots');
    this.rngMeta = rng('meta');

    /** @type {Map<string, PlayerState>} */
    this.players = new Map();
    const seen = new Set();
    for (const s of opts.seats) {
      if (!s || typeof s.playerId !== 'string' || seen.has(s.playerId)) continue;
      seen.add(s.playerId);
      this.players.set(s.playerId, new PlayerState(this, s));
    }
    if (!this.players.size) throw new TypeError('Match: seats required');
    this.order = [...this.players.values()].sort((a, b) => a.seat - b.seat);
    /**
     * Spectator seats (opts.spectators / addSpectator): playerId → a stand-in every watch path treats like an eliminated
     * human (alive false; no PlayerState, never a field's player or authority).
     * @type {Map<string, { playerId: string, isBot: false, left: false, alive: false, connected: true, spectator: true }>}
     */
    this.spectators = new Map();
    /**
     * Exactly one human seat at the start (独立模拟, or a 同盟 room started alone / with AI teammates only): nobody waits
     * on anybody, so no phase outside a battle is timed — soloUntimed (user playtest #4 item 3). The mode's own rules
     * (draft order and skip, 6 机变 cards, 联防 …) stay.
     */
    this.loneHuman = this.order.filter((p) => !p.isBot).length === 1;

    // per-match setup (DESIGN §6.5)
    const setup = setupMatchWaves(this.gd, this.rngSetup);
    if (opts.stageId != null && (!(this.gd.mode.stages || []).includes(opts.stageId) || !this.gd.stage(opts.stageId) || this.gd.stage(opts.stageId).active === false || !(Number(this.gd.stage(opts.stageId).weight) > 0))) throw new TypeError('unavailable stage for this mode');
    this.stageId = opts.stageId ?? setup.stageId;
    this.stage = this.stageId ? this.gd.stage(this.stageId) : null;
    this.factions = setup.factions;
    this.bossId = setup.bossId;
    this.hiddenBossId = setup.hiddenBossId;
    const bans = drawDisabledBonds(this.gd, this.rngSetup);
    this.disabledBonds = bans.drawn;
    this.staticInactiveBonds = bans.staticOff;
    this.bannedChess = bans.banned;
    this.pool = new SharedPool(this.gd, { banned: bans.banned });
    this.itemPool = new SharedItemPool(this.gd, () => this.order);
    // 自选编队 (0.2.0): each human's slotted DIY pieces get their own stock — none for one whose bonds are all off this
    // match (player/diy.js initDiyStock); no randomness is drawn here
    const off = new Set([...bans.drawn, ...bans.staticOff]);
    for (const ps of this.order) ps.initDiyStock(off);

    this.phase = PHASE.LOBBY;
    this.round = 0;
    this.deadline = 0;
    /** Final Assault / Hidden Core: ms epoch when the overtime drain starts (m.public.overtimeAt) */
    this.overtimeAt = 0;
    this.uidSeq = 0;
    this.ended = false;
    this.disposed = false;
    this.startedAt = this.sched.now();
    /** @type {Set<any>} */
    this._timers = new Set();
    this._phaseTimer = null;
    this._infoAdvanceTimer = null;
    this.setupRevision = 0;
    this.setupVote = null;
    this._setupVoteSeq = 0;
    /** @type {Map<string, number>} last accepted 重刷本局 start per seat (30 s cooldown; DESIGN §28.21) */
    this._rerollStartAt = new Map();
    this._turnTimer = null;
    this._pubDirty = false;
    this._pubTimer = null;
    this._lastPubAt = -Infinity;
    this._lastPubJson = '';
    /** @type {Set<PlayerState>} */
    this._privDirty = new Set();
    this.errors = [];
    this.errorCount = 0;
    this.simErrors = 0;
    /** @type {Map<string, { label: string, who: string, message: string, stack: string|null, battles: number, count: number }>} */
    this.simErrorLog = new Map();
    this._prepEndQueued = false;

    this.draft = null;
    this.sp = null;
    this.wave = null;
    this.bossWaves = null;
    this.bossPairs = null; // drawn for the Final Assault, drawn anew for the Hidden Core (GitHub #845, DESIGN §35.27)
    this.bossPairsRound = null; // the round whose first plan drew bossPairs (a re-plan after a departure keeps them)
    this.fields = [];
    this.runner = null;
    /** playerId → fieldId */
    this.watchers = new Map();
    /**
     * Watch preference (community report of 2026-10-06, item 56; the idea of PR #189): viewer playerId → the player it
     * last chose to watch with a manual g.watch. Every phase reset starts an eliminated human or a spectator seat on that
     * player again (its prep board, its battle field) — else the first player still in — instead of its own empty board.
     */
    this.watchPref = new Map();
    this.lastResults = new Map();
    this.unitePlan = null;
    /** 联防 outcome for the SETTLE view: { through, helpers, leakers, losses } (settle()), null when no 联防 resolved */
    this.uniteResultView = null;
    /** server-run 联防: the leakers' counts last published (_uniteTick) */
    this._uniteLeftKey = null;
    /** 联防: { plan, bounds } — per leaker the most survivors settlement can bill (_uniteLeft's clamp) */
    this._uniteBounds = null;
    this.teamLp = null;
    this.bossPool = null;
    this.hiddenLayerSum = 0;
    this.hiddenReached = false;
    this.outcome = null;
    this._turnToken = 0;
  }
}

// the method modules, in this order (a name defined twice is an error, never a silent override)
for (const part of [MatchPlatform, MatchInfra, MatchMessaging, MatchViews, MatchIntents, MatchPhases, MatchSpDraft, MatchPrep, MatchCombat, MatchUnite, MatchBoss, MatchSettle]) {
  for (const key of Reflect.ownKeys(part.prototype)) {
    if (key === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(Match.prototype, key)) throw new Error(`Match.${String(key)} is defined twice`);
    Object.defineProperty(Match.prototype, key, Object.getOwnPropertyDescriptor(part.prototype, key));
  }
}
