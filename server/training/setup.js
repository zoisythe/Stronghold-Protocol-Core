import { createRng, deriveSeed } from '../sim/rng.js';
import { checkLoadout, checkLoadoutOps, checkNotOwned, cultivationCharIds, loadoutOptions, checkDiyPicks } from '../../shared/protocol.js';
import { isDroppableChess } from '../../shared/standIn.js';
import { diyPool, diySlotIds, diySlot, checkDiyPick, isPrototypePick, lockedSelection } from '../../shared/diy.js';
import { KITTED_CHARS } from '../sim/content/kits/index.js';

export function resolveSetup(data, seed, config, players) {
  const probability = config.perturbation_probability ?? 0;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new TypeError('perturbation_probability must be in [0,1]');
  const rng = createRng(deriveSeed(seed, 'training-setup'));
  const result = [];
  for (let seat = 0; seat < players; seat++) {
    const baseline = structuredClone(config.setups?.[seat] ?? config.setup ?? {});
    const loadout = checkLoadout(baseline.loadout ?? {}, (id) => data.chess[id]);
    const ops = checkLoadoutOps(baseline.ops ?? {}, (id) => cultivationCharIds(data.chess, data.backups).has(id));
    const ownership = checkNotOwned(baseline.notOwned ?? [], (id) => data.chess[id]);
    const diy = checkDiyPicks(baseline.diy ?? {}, { data, kitted: KITTED_CHARS });
    for (const r of [loadout, ops, ownership, diy]) if (!r.ok || r.dropped) throw new TypeError(r.detail || r.error || 'invalid baseline setup');
    const out = { loadout: loadout.loadout, ops: ops.ops, notOwned: ownership.notOwned, diy: diy.picks };
    const perturbed = probability > 0 && rng.chance(probability);
    if (perturbed) {
      out.notOwned = Object.keys(data.chess).sort().filter((id) => isDroppableChess(data.chess[id]) && rng.chance(0.5));
      for (const [id, rec] of Object.entries(data.chess).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        if (rec.isGolden || rec.isDiy || rec.isHidden || rec.visible === false) continue;
        const golden = data.chess[rec.goldenId];
        const options = loadoutOptions(rec, golden);
        if (options.skills.length) out.loadout[id] = { skill: rng.pick(options.skills), module: out.loadout[id]?.module ?? options.defaultModule };
      }
      const picks = {};
      for (const slotId of diySlotIds(data)) {
        const tier = diySlot(slotId, data).tier;
        const candidates = [];
        for (const charId of diyPool(tier, { data, kitted: KITTED_CHARS })) {
          const selected = Object.values(picks).filter((p) => p.charId === charId);
          if (selected.length && (!isPrototypePick(data, tier, charId) || Object.entries(picks).some(([id, p]) => p.charId === charId && diySlot(id, data).tier === tier))) continue;
          if (isPrototypePick(data, tier, charId)) {
            const lock = lockedSelection(data, tier, charId);
            const r = checkDiyPick(slotId, { charId, ...lock }, data);
            if (r.ok) candidates.push(r.pick);
          } else {
            const old = Object.values(out.diy).find((p) => p.charId === charId);
            // Modules are baseline choices, not another curriculum dimension.
            for (let skillIndex = 0; skillIndex <= 9; skillIndex++) {
              const r = checkDiyPick(slotId, { charId, skillIndex, uniEquipId: old?.uniEquipId ?? null }, data);
              if (r.ok) candidates.push(r.pick);
            }
          }
        }
        // Sample operators uniformly, then that operator's legal skills uniformly.
        const chars = [...new Set(candidates.map((p) => p.charId))];
        if (!chars.length) throw new Error(`no legal DIY pick for ${slotId}`);
        const charId = rng.pick(chars);
        picks[slotId] = rng.pick(candidates.filter((p) => p.charId === charId));
      }
      out.diy = picks;
    }
    result.push({ ...out, perturbed });
  }
  return result;
}
