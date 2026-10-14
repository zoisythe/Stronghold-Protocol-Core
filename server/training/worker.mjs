import { parentPort } from 'node:worker_threads';
import { Env } from './Env.js';

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
