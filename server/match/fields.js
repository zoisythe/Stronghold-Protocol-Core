// Synchronised original 30 Hz field runner; failures remain explicit.
import { TICK, SNAPSHOT_EVERY } from '../sim/constants.js';

export const MAX_TICKS_PER_INTERVAL = 8;
export const INTERVAL_MS = 1000 / 30;
export const GAME_SPEED = 2;
export const HARD_CAP_SECONDS = 3700;
const SNAP_EVERY = Number.isInteger(SNAPSHOT_EVERY) && SNAPSHOT_EVERY > 0 ? SNAPSHOT_EVERY : 3;

/** Catch-up cap per pacing interval: 8 ticks at the normal 2× speed, proportionally more when sped up. */
export function maxTicksPerInterval(speed) {
  return Math.max(MAX_TICKS_PER_INTERVAL, Math.ceil((Number(speed) || GAME_SPEED) * 4));
}

export class FieldRunner {
  /**
   * @param {import('./Match.js').Match} m
   * @param {Array<{ fieldId: string, kind: string, players: string[], battle: any, live?: boolean }>} fields
   * @param {{ onTick?: (runner: FieldRunner) => void, onDone: (runner: FieldRunner) => void }} hooks
   */
  constructor(m, fields, { onTick = null, onDone, emit = true }) {
    this.m = m;
    this.fields = fields;
    this.emit = emit !== false;
    for (const f of fields) f.live = !f.battle.finished;
    this.onTick = onTick;
    this.onDone = onDone;
    this.ticks = 0;
    this.acc = 0;
    this.last = 0;
    this.interval = null;
    this.done = false;
    this.stopped = false;
    this.crashes = 0;
  }

  /** Game seconds elapsed on the master clock (all fields step in lockstep). */
  get time() { return this.ticks * TICK; }

  start() {
    if (this.fields.every((f) => !f.live)) { this._finish(); return; }
    if (this.m.sched.instant) {
      // one scheduler callback: run everything now (virtual time / tools)
      this.m.later(0, () => this._runInstant());
      return;
    }
    this.last = this.m.sched.now();
    this.interval = this.m.sched.setInterval(() => this.m.guard(() => this._pump()), INTERVAL_MS);
  }

  stop() {
    this.stopped = true;
    if (this.interval) { this.m.sched.clearInterval(this.interval); this.interval = null; }
  }

  _runInstant() {
    const cap = Math.ceil(HARD_CAP_SECONDS / TICK);
    while (!this.stopped && !this.done && this.ticks < cap) {
      this._tick();
      if (this.fields.every((f) => !f.live)) break;
    }
    if (!this.done && !this.stopped) this._forceAll('timeout');
    this._checkDone();
  }

  _pump() {
    if (this.stopped || this.done) return;
    const now = this.m.sched.now();
    const dt = Math.max(0, now - this.last);
    this.last = now;
    if (this.m.paused) return; // solo pause (Match.setPause): the field clock stands still
    const speed = Number.isFinite(this.m.gameSpeed) && this.m.gameSpeed > 0 ? this.m.gameSpeed : GAME_SPEED;
    this.acc += (dt / 1000) * speed;
    const cap = maxTicksPerInterval(speed);
    let n = Math.floor(this.acc / TICK + 1e-9);
    if (n > cap) { n = cap; this.acc = 0; } else this.acc -= n * TICK;
    for (let i = 0; i < n && !this.done && !this.stopped; i++) {
      this._tick();
      if (this.fields.every((f) => !f.live)) break;
    }
    if (this.time >= HARD_CAP_SECONDS) this._forceAll('timeout');
    this._checkDone();
  }

  _tick() {
    this.ticks++;
    for (const f of this.fields) {
      if (!f.live) continue;
      const b = f.battle;
      try {
        b.step();
      } catch (e) {
        this.crashes++;
        this.m.reportError(`field ${f.fieldId} step`, e);
        this._forceField(f, 'timeout');
      }
      if (b.finished) { f.live = false; this.m.markPublic(); }
      if (this.ticks % SNAP_EVERY === 0 || !f.live) this._emit(f);
    }
    if (this.onTick) {
      try { this.onTick(this); } catch (e) { this.m.reportError('field onTick', e); }
    }
    for (const f of this.fields) if (f.live && f.battle.finished) { f.live = false; this.m.markPublic(); this._emit(f); }
  }

  _forceField(f, reason) {
    try {
      f.battle.forceEnd(reason);
    } catch (e) {
      this.m.reportError(`field ${f.fieldId} forceEnd`, e);
    }
    if (!f.battle.finished) {
      // the battle object is unusable: replace it by a finished stand-in (players keep a clean result)
      throw new Error('battle forceEnd failed');
    }
    f.live = false;
    this.m.markPublic();
  }

  /** Force-end every live field (team LP 0, hard cap). */
  _forceAll(reason) {
    for (const f of this.fields) if (f.live || !f.battle.finished) this._forceField(f, reason);
  }

  forceAll(reason = 'forced') { this._forceAll(reason); this._checkDone(); }

  _emit(f) { f.battle.drainEvents(); }

  _checkDone() {
    if (this.done || this.stopped) return;
    if (this.fields.some((f) => f.live && !f.battle.finished)) return;
    this._finish();
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    if (this.interval) { this.m.sched.clearInterval(this.interval); this.interval = null; }
    this.onDone(this);
  }

  /** Result of a field (never throws). */
  resultOf(f) {
    try {
      const r = f.battle.result();
      if (r && typeof r === 'object' && r.perPlayer) return r;
    } catch (e) {
      this.m.reportError(`field ${f.fieldId} result`, e);
    }
    throw new Error('battle produced no result');
  }
}


export const HEADLESS_SLICE_MS = Infinity;
