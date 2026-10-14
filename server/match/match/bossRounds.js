// Retained gameplay methods from the 0.2.6 implementation.
import { PHASE, GEO } from '../../../shared/constants.js';
import { createRng, deriveSeed } from '../../sim/rng.js';
import { buildBossWave, bountySpawns } from '../waves.js';
import { pairPlayers, bossPoolHp, SharedBossPool, hiddenEligible, BOSS_HIT_STEPS } from '../finalAssault.js';
import { FieldRunner } from '../fields.js';
import { FLOW_TICKER_PRIORITY, DELAYS } from './common.js';

export class MatchBoss {
  startFinalAssault(hidden) {
    const alive = this.alivePlayers();
    if (!alive.length) { this.finish({ victory: false, reason: 'eliminated' }); return; }
    this.phase = hidden ? PHASE.HIDDEN_CORE : PHASE.FINAL_ASSAULT;
    this.lastResults = new Map();
    if (!hidden) {
      this.teamLp = alive.reduce((s, p) => s + Math.max(0, p.lp), 0);
      for (const ps of alive) ps.lpAtFinal = Math.max(0, ps.lp);
    }
    const bossId = hidden ? this.hiddenBossId : this.bossId;
    // BOSS_HIT tickers ("对敌方领袖造成的伤害超过20% / 50% / 80%"): the player's damage to THIS leader over its pool —
    // the pool's own per-player tally, one pool per boss round. stats.bossDamage (the result's 领袖伤害) adds up both
    // rounds, so it would credit the Final Assault's damage to the hidden leader ("隐藏boss还没打就出了50%播报").
    const hitSteps = new Map();
    const pool = new SharedBossPool(bossPoolHp(this.gd, bossId, alive.length), {
      onHit: (pid, dmg) => {
        const ps = this.players.get(pid);
        if (!ps) return;
        ps.stats.bossDamage += dmg;
        const share = (pool.byPlayer.get(pid) || 0) / pool.maxHp;
        const done = hitSteps.get(pid) || 0;
        let reached = done;
        BOSS_HIT_STEPS.forEach((s, i) => { if (share >= s) reached = Math.max(reached, i + 1); });
        if (reached > done) {
          hitSteps.set(pid, reached);
          this.tickerFor('BOSS_HIT', [ps.name], { playerId: pid, param: String(BOSS_HIT_STEPS[reached - 1]) });
        }
      },
    });
    this.bossPool = pool;
    const groups = pairPlayers(alive, createRng(deriveSeed(this.seed, 'boss-pairs')), this.bossPairs);
    this.bossPairs = groups.map(g => g.map(p => p.playerId));
    const reuse = this.bossWaves && this.bossWaves.length === groups.length && this.bossWaves.every((w, i) => w.players.join() === groups[i].map((p) => p.playerId).join());
    this.fields = groups.map((g, i) => {
      const solo = this.isSolo || g.length === 1;
      const wave = reuse ? this.bossWaves[i].wave : buildBossWave(this.gd, this.rngWaves, this.factions, this.round, { bossId, solo });
      // one spawn list per field, shared by the field's players' onBattleStart handlers (edit it in place)
      const spawns = wave.spawns.map((s) => ({ ...s, mods: s.mods ? { ...s.mods } : undefined }));
      // bounties with battles left (a multi-round card lasts MULTI_ROUND_BOUNTY_BATTLES) follow their player into the
      // boss field, on the player's half
      g.forEach((ps, j) => {
        for (const b of bountySpawns(this.gd, this.round, wave, ps.bounties, ps.playerId, { solo: this.isSolo, side: j === 0 ? 'L' : 'R' })) spawns.push(b);
      });
      const inputs = g.map((ps, j) => {
        const input = ps.battleInput({ side: j === 0 ? 'L' : 'R', colOffset: j === 0 ? 0 : 8 });
        input.lpForBoss = this.teamLp;
        // `side` + `routes`: the player's half of a pair field (spawn-list edits for one player, e.g. 鸭爵's swap)
        const ev = { input, kind: hidden ? 'hidden' : 'boss', round: this.round, spawns, routes: wave.routes, side: g.length > 1 ? (j === 0 ? 'L' : 'R') : null };
        this.dispatch(ps, 'onBattleStart', ev);
        return ev.input && typeof ev.input === 'object' ? ev.input : input;
      });
      const fieldId = `b${i + 1}`;
      const bopts = {
        seed: deriveSeed(this.seed, `${fieldId}:${this.round}`),
        kind: hidden ? 'hidden' : 'boss',
        modeId: this.modeId,
        round: this.round,
        stageId: this.stageId,
        rect: { ...GEO.BOSS_RECT },
        timeLimit: Infinity,
        players: inputs,
        spawns: this._sanitizeSpawns(spawns),
        routes: wave.routes,
        sharedBoss: this.bossPool,
        // the round's enemy effects for the leaders' mid-fight summons (server/sim/content/bosses.js summonMods)
        flags: { layerGainsEnabled: false, ...this.gd.dp, enemyScale: this.gd.enemyScale(this.round) },
        fieldId,
        enemyOverrides: wave.overrides,
        waveId: wave.templateId,
        bossId,
      };
      const battle = this.newBattle(bopts);
      try {
        battle.on('enemyLeak', (ctx) => this._bossLeak(ctx && ctx.enemy), { priority: -1000, owner: 'match' });
        // leader "扣除目标生命" effects (boss_7 Doom, 斥退 …: server/sim/content/bosses.js lpLoss) hit the team pool
        battle.on('lpLoss', (ctx) => this._teamLpLoss(ctx && ctx.amount), { priority: -1000, owner: 'match' });
      } catch (e) { this.reportError('boss leak hook', e); }
      return { fieldId, kind: hidden ? 'hidden' : 'boss', players: g.map((p) => p.playerId), battle, live: true };
    });
    this.overtimeApplied = 0;
    // HUD: the boss level's countdown (maxPlayTime, 120 real s — the battle goes on past it) and the moment the
    // overtime drain starts (150 real s), both on the field clock
    const onClock = (realS) => this.sched.now() + Math.round(((realS * this.gd.combatTimeScale) / this.gameSpeed) * 1000);
    const levelTime = this.gd.bossLevelTime(this.round);
    // Maintainer 2026-10-10: only teams with an AI teammate keep the extra grace after the visible countdown.
    // Freeze this choice for the fight; a disconnect / host transfer cannot change its LP clock midway.
    const team = this.order.filter((p) => !p.left);
    this.bossOvertimeStartReal = team.length > 1 && team.some((p) => p.isBot)
      ? this.gd.bossOvertimeAfterReal : (levelTime || this.gd.bossOvertimeAfterReal);
    this.deadline = this.sched.instant || !levelTime ? 0 : onClock(levelTime);
    this.overtimeAt = this.sched.instant ? 0 : onClock(this.bossOvertimeStartReal);
    this.markPublic();
    this.runner = new FieldRunner(this, this.fields, {
      onTick: (runner) => this._bossTick(runner),
      onDone: (runner) => this._finalDone(runner, hidden),
    });
    this.runner.start();
  }

  _settleBossBounties(ps, pp, perfect) {
    let coins = Math.max(0, Math.trunc(Number(pp.coins) || 0));
    if (perfect) for (const b of ps.bounties) if (b.card.payout === 'perfect') coins += b.card.coin;
    if (coins > 0) { ps.pendingFunds += coins; ps.stats.fundsGained += coins; }
    if (!ps.bounties.length) return;
    for (const b of ps.bounties) b.roundsLeft--;
    ps.bounties = ps.bounties.filter((b) => b.roundsLeft > 0);
    ps.dirty();
  }

  _bossLeak(enemy) {
    if (!enemy || this.teamLp == null) return;
    // lifePointReduce from data: 0 for harmless enemies (e.g. 装置 / unharmful escorts), 1 when absent
    const lpr = Number.isFinite(enemy.lpr) && enemy.lpr >= 0 ? enemy.lpr : 1;
    this._teamLpLoss(lpr);
  }

  _teamLpLoss(amount) {
    const n = Number(amount);
    if (this.teamLp == null || !Number.isFinite(n) || !(n > 0)) return;
    this.teamLp = Math.max(0, this.teamLp - n);
    this._syncTeamLp();
    this.markPublic();
  }

  _syncTeamLp() {
    if (this.teamLp == null) return;
    const alive = this.alivePlayers().filter((p) => p.lpAtFinal != null);
    if (!alive.length) return;
    const total = Math.max(0, Math.round(this.teamLp));
    const base = alive.reduce((s, p) => s + Math.max(0, p.lpAtFinal), 0);
    const rows = alive.map((p) => {
      const v = base > 0 ? (total * Math.max(0, p.lpAtFinal)) / base : total / alive.length;
      const n = Math.floor(v + 1e-9);
      return { p, n, frac: v - n };
    });
    let left = total - rows.reduce((s, x) => s + x.n, 0);
    for (const x of rows.slice().sort((a, b) => b.frac - a.frac || a.p.seat - b.p.seat)) {
      if (left <= 0) break;
      x.n++;
      left--;
    }
    for (const x of rows) if (x.p.lp !== x.n) { x.p.lp = x.n; x.p.dirty(); }
  }

  _applyOvertime(gt) {
    const due = this.gd.bossOvertimeDue(gt, this.bossOvertimeStartReal);
    if (due > this.overtimeApplied) {
      const loss = due - this.overtimeApplied;
      this.overtimeApplied = due;
      this._teamLpLoss(loss);
    }
  }

  _bossTick(runner) {
    this._applyOvertime(runner.time);
    if (this.teamLp <= 0 && this.bossPool.hp > 0) runner.forceAll('forced');
    // client-side combat with every boss field on the server: humans that reconnect / watch run display replicas
    // whose LocalBossPool follows b.pool
    if (runner.ticks % 6 === 0) this.markPublic();
    if (runner.ticks % 30 === 0) this.flush();
  }

  _finalDone(runner, hidden) { this._finishFinal(hidden, (f) => runner.resultOf(f)); }

  _finishFinal(hidden, resultOf) {
    if (this.phase !== (hidden ? PHASE.HIDDEN_CORE : PHASE.FINAL_ASSAULT)) return;
    // the end condition the server registered first decides (client-side combat: _endFinal — pool 0 → victory, team LP 0
    // → defeat); a boss field's final result may never turn a defeat into a victory (user playtest #6 item 5)
    const victory = this._finalEnding ? this._finalEnding === 'cleared' : this.bossPool.hp <= 0;
    for (const f of this.fields) {
      const res = resultOf(f);
      this._collectSimErrors(f, res);
      f.live = false;
      for (const pid of f.players) {
        const pp = res.perPlayer && res.perPlayer[pid];
        const ps = this.players.get(pid);
        if (pp) this.lastResults.set(pid, pp);
        if (pp && ps) {
          ps.stats.dmgDealt += Number(pp.damageDealt) || 0;
          ps.stats.kills += Number(pp.killed) || 0;
          ps.dirty(); // m.private.stats
          this._charDamageTickers(ps, pp);
        }
        if (pp && ps) {
          // the own battle counts as perfect when the team won, the result is a real one (not the stand-in of a field that
          // never reported) and the player's own field let no counted enemy through [ASSUMED: the boss battle is a battle
          // of the player's own — "下场作战" — so a perfect-payout card pays as after a normal one]
          const perfect = victory && !res.synthetic && pp.perfect === true && !(pp.leaked || []).some((l) => l && l.counted !== false)
;
          this._settleBossBounties(ps, pp, perfect);
        }
        if (pp && ps) this.dispatch(ps, 'onBattleResult', { result: pp, lpLoss: 0, perfect: !!pp.perfect, boss: true });
      }
    }
    this._syncTeamLp();
    this.deadline = 0;
    this.overtimeAt = 0;
    this.markPublic();
    this.runner = null;
    if (!hidden) {
      const eligible = victory && !!this.hiddenBossId && hiddenEligible(this.gd, { layerSum: this.hiddenLayerSum, teamLp: this.teamLp });
      this.later(this.scaled(DELAYS.SETTLE), () => {
        if (eligible) {
          this.hiddenReached = true;
          this.bossPool = null;
          this.tickerText('隐秘核心已解锁', FLOW_TICKER_PRIORITY);
          this.startRound(this.gd.hiddenRound);
        } else {
          this.finish({ victory, reason: victory ? 'victory' : 'defeat' });
        }
      });
    } else {
      this.later(this.scaled(DELAYS.SETTLE), () => this.finish({ victory: true, hiddenCleared: victory, reason: 'victory' }));
    }
  }
}
