// Headless gameplay methods; upstream baseline is recorded in data/core-manifest.json.
import { PHASE, GEO } from '../../../shared/constants.js';
import { boardOrder, pieceDir } from '../board.js';
import { bountySpawns, previewOf } from '../waves.js';
import { bossFieldPlacement } from '../finalAssault.js';

function cultivationInfo(lo) {
 const out = {};
 if (lo && Number.isInteger(lo.potential) && lo.potential < 6) out.potential = lo.potential;
 if (lo && Number.isInteger(lo.cultivate)) out.cultivate = lo.cultivate;
 return out;
}

export class MatchViews {
  nextEnemiesFor(ps) {
    if (!ps.alive) return [];
    if (this.bossWaves) {
      const g = this.bossGroupOf(ps);
      if (!g) return [];
      return previewOf([...g.wave.spawns, ...bountySpawns(this.gd, this.round, g.wave, ps.bounties, ps.playerId, { solo: this.isSolo, side: g.side })]);
    }
    if (!this.wave) return [];
    const bounty = bountySpawns(this.gd, this.round, this.wave, ps.bounties, ps.playerId, { solo: this.isSolo });
    return previewOf([...this.wave.spawns, ...bounty]);
  }

  _diyInfo(ps, piece) {
    const p = piece.kind === 'chess' && typeof ps.diyPickOf === 'function' ? ps.diyPickOf(piece.id) : null;
    return p ? { charId: p.charId, skillIndex: p.skillIndex, uniEquipId: p.uniEquipId } : undefined;
  }

  prepMapChars(ps) {
    if (!ps?.alive || this.phase !== PHASE.PREP || !this.teamMedicGranted()) return [];
    const id = 'char_605_cmedic';
    const slot = this.stage?.mapChars?.find((m) => m?.key === id && Array.isArray(m.pos) && m.pos[0] >= 9 && m.pos[0] <= 12
      && m.pos[1] >= 0 && m.pos[1] <= 10 && !/multi_only/.test(String(m.alias)));
    const rec = this.gd.token(id);
    if (!slot || !rec) return [];
    const dir = slot.dir || 'RIGHT';
    return [{
      id: -ps.seat - 1, uid: -ps.seat - 1, kind: 'token', side: 'ally', ownerId: ps.playerId, defId: id,
      area: 'board', name: rec.name || id, tier: 1, golden: false,
      spine: rec.assets?.spine || id, avatar: rec.assets?.avatar || id,
      x: slot.pos[1], y: slot.pos[0], dir, facing: dir === 'LEFT' ? -1 : 1, maxHp: rec.stats?.maxHp || 1,
    }];
  }

  _prepBoardUnits(ps) {
    const units = this.prepMapChars(ps);
    // the player's own view of the data (0.2.0 自选编队: its slotted DIY slots are its operators — player/diy.js)
    const gd = ps.gd || this.gd;
    for (const { r, c, piece } of boardOrder(ps.board)) {
      const chess = piece.kind === 'token' ? null : gd.chess(piece.id);
      // 0.2.0 补位: a chess this player fields as its stand-in is deployed with the stand-in's body — name, art, max HP,
      // skill, like the sim's UnitInfo (`standInFor` = the replaced operator's charId)
      const rec = piece.kind === 'token' ? gd.token(piece.id) : ps.fieldRecord(chess);
      const assets = (rec && rec.assets) || {};
      // DESIGN §16: the skill / module THIS player's operator fights with (the scout's detail card shows it, like the
      // sim's UnitInfo in a shared field); moduleId only for an elite; 0.2.2 its potential (below 6) and 练度
      const lo = piece.kind === 'chess' && chess ? ps.loadoutFor(chess) : null;
      units.push({
        id: piece.uid, uid: piece.uid, kind: piece.kind === 'token' ? 'token' : 'op', side: 'ally', ownerId: ps.playerId, defId: piece.id,
        area: 'board',
        name: rec ? rec.name : piece.id, tier: rec && Number.isInteger(rec.tier) ? rec.tier : 1, golden: !!(rec && rec.isGolden),
        spine: assets.spine || (rec && rec.charId) || piece.id, avatar: assets.avatar || (rec && rec.charId) || piece.id,
        x: c, y: r, dir: pieceDir(piece), facing: pieceDir(piece) === 'LEFT' ? -1 : 1, maxHp: rec && rec.stats && Number.isFinite(rec.stats.maxHp) ? rec.stats.maxHp : 1,
        skillIndex: lo && Number.isInteger(lo.skillIndex) ? lo.skillIndex : undefined,
        moduleId: lo && typeof lo.moduleId === 'string' ? lo.moduleId : undefined,
        // the equipped items (like the sim's UnitInfo): a 变形同构体 wearer shows as a member of the bond it grants
        items: piece.kind === 'chess' && Array.isArray(piece.items) && piece.items.length ? piece.items.map((it) => it.id) : undefined,
        standInFor: rec && rec.standInFor ? rec.standInFor : undefined,
        diy: this._diyInfo(ps, piece),
        ...cultivationInfo(lo),
      });
    }
    return units;
  }

  _bossMateOf(ps) {
    if (!ps || !this.bossWaves || this.fields.length) return null;
    const g = this.bossGroupOf(ps);
    const pid = g && g.players.length > 1 ? g.players.find((x) => x !== ps.playerId) : null;
    const mate = pid ? this.players.get(pid) : null;
    return mate ? { mate, side: g.side === 'R' ? 'L' : 'R' } : null;
  }

  bossMateView(ps) {
    const m = ps && ps.alive ? this._bossMateOf(ps) : null;
    if (!m) return null;
    return { playerId: m.mate.playerId, side: m.side, units: this._prepBoardUnits(m.mate).map((u) => this._onBossHalf(u, m.side)) };
  }

  _onBossHalf(u, side) {
    const p = bossFieldPlacement(side, u.y, u.x, u.dir || 'RIGHT');
    const v = { ...u, x: p.col, y: p.row };
    // a board piece keeps facing the same way relative to the leader (mirrored on the right half); a bench piece has no
    // stored facing (it faces right, as the own prep bench draws it)
    if (u.dir) { v.dir = p.dir; v.facing = p.dir === 'LEFT' ? -1 : 1; }
    return v;
  }
}
