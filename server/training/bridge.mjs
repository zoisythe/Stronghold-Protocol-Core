import { Worker } from 'node:worker_threads';
import { createInterface } from 'node:readline';

const index = process.argv.indexOf('--workers');
const count = index < 0 ? 1 : Number(process.argv[index + 1]);
if (!Number.isInteger(count) || count < 1 || count > 64) throw new TypeError('workers must be 1..64');
const routes = new Map(), pending = new Map();
let nextEnv = 0, sequence = 0, stopping = false;
const workers = Array.from({ length: count }, () => {
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), { stdout: true, stderr: true });
  worker.stdout.pipe(process.stderr); worker.stderr.pipe(process.stderr);
  worker.on('message', (message) => {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.result);
    else request.reject(Object.assign(new Error(message.error.message), { name: message.error.name, stack: message.error.stack }));
  });
  const fail = (error) => {
    worker.failed = error;
    for (const [id, request] of pending) if (request.worker === worker) { pending.delete(id); request.reject(error); }
  };
  worker.on('error', fail);
  worker.on('exit', (code) => { if (!stopping) fail(new Error(`worker exited (${code}); its environments are unavailable`)); });
  return worker;
});
const call = (env, op, args = []) => new Promise((resolve, reject) => {
  const worker = routes.get(env);
  if (!worker || worker.failed) { reject(worker?.failed || new Error('unknown environment')); return; }
  const id = ++sequence;
  pending.set(id, { worker, resolve, reject });
  worker.postMessage({ id, env, op, args });
});
const shutdown = async () => {
  stopping = true;
  await Promise.all(workers.map((worker) => worker.terminate()));
};
const reply = (message, done = undefined) => process.stdout.write(JSON.stringify(message) + '\n', done);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', async (line) => {
  let request;
  try {
    request = JSON.parse(line);
    if (!Number.isSafeInteger(request.id) || !Array.isArray(request.args ?? [])) throw new TypeError('invalid request');
    let result;
    if (request.op === 'create') {
      const env = ++nextEnv;
      routes.set(env, workers[(env - 1) % count]);
      result = await call(env, 'create');
    } else if (request.op === 'batch') {
      const items = request.args[0];
      if (!Array.isArray(items)) throw new TypeError('batch requires an item list');
      result = await Promise.all(items.map((item) => call(item.env, item.op, item.args)));
    } else if (request.op === 'shutdown') {
      await shutdown();
      reply({ id: request.id, ok: true, result: null }, () => process.exit(0));
      return;
    } else {
      result = await call(request.env, request.op, request.args);
      if (request.op === 'close') routes.delete(request.env);
    }
    reply({ id: request.id, ok: true, result });
  } catch (error) { reply({ id: request?.id ?? null, ok: false, error: { name: error.name, message: error.message } }); }
});
input.on('close', () => { if (!stopping) shutdown().then(() => process.exit(0)); });
