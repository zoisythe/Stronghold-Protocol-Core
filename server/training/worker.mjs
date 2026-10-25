import { parentPort, workerData } from 'node:worker_threads';
import { getVersionData, setData } from '../data.js';
import { DEFAULT_VERSION } from '../../shared/versions.js';
import { rememberOfficialBounds } from '../../shared/content/officialBounds.js';

// Version-specific module caches must be initialized before any gameplay import.
if (workerData?.version && workerData.version !== DEFAULT_VERSION) {
  const data = getVersionData(workerData.version);
  setData(data);
  rememberOfficialBounds(data);
}
const { Env } = await import('./Env.js');

const environments = new Map();
const allowed = new Set(['reset', 'observe', 'legal_actions', 'step', 'teacher_action', 'debug_state']);
parentPort.on('message', ({ id, env, op, args = [] }) => {
  try {
    let result;
    if (op === 'create') { environments.set(env, new Env()); result = env; }
    else if (op === 'close') { environments.get(env)?.close(); environments.delete(env); result = null; }
    else {
      const instance = environments.get(env);
      if (!instance) throw new Error('unknown or closed environment');
      if (!allowed.has(op)) throw new Error('unknown operation');
      result = instance[op](...args);
    }
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) { parentPort.postMessage({ id, ok: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
});
