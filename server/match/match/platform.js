import { validateC2S } from '../../../shared/protocol.js';
import { PHASE, ERR } from '../../../shared/constants.js';
import { OK, fail } from './common.js';

export class MatchPlatform {
  start() {
    if (this.disposed || this.ended || this.phase !== PHASE.LOBBY) return;
    if (!this.gd.visibleChess.length || !this.pool.entries.size) throw new Error('unusable game data');
    this.enterInfoCheck();
  }
  handle(playerId, action) {
    const ps = this.players.get(playerId);
    if (!ps || ps.left) return fail(ERR.NOT_IN_ROOM);
    if (this.disposed || this.ended) return fail(ERR.WRONG_PHASE);
    if (!action?.t?.startsWith('g.') || validateC2S(action)) return fail(ERR.BAD_MSG);
    return this._handle(ps, action) || OK;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.runner?.stop();
    for (const h of this._timers) this.sched.clearTimeout(h);
    this._timers.clear();
    this.sched.dispose();
  }
}
