// Reimport the retained generated tables from an immutable Git source revision.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ref = process.argv[2] || '488db49f11daf862b67ce26fa4cf89aa6cba2466';
const output = resolve(process.argv[3] || join(root, 'data'));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
const revision = git('rev-parse', `${ref}^{commit}`).toString().trim();
const files = git('ls-tree', '-r', '--name-only', revision, '--', 'data').toString().trim().split('\n')
  .filter((name) => /^data\/[^/]+\.json$/.test(name) && !['data/assets.json', 'data/local-assets.json', 'data/emotes.json', 'data/tuning.json', 'data/core-manifest.json'].includes(name));
const strip = (value) => Array.isArray(value) ? value.map(strip) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'assets').map(([key, child]) => [key, strip(child)])) : value;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = { schema_version: 1, transform_version: 1, source_revision: revision, files: {} };
mkdirSync(output, { recursive: true });
const save = async (path, bytes) => {
  const temporary = `${path}.import-${process.pid}`;
  writeFileSync(temporary, bytes);
  try {
    for (let attempt = 0; ; attempt++) {
      try { renameSync(temporary, path); return; }
      catch (error) { if (attempt >= 10) throw error; await delay(50); }
    }
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
};
for (const name of ['assets.json', 'local-assets.json', 'emotes.json', 'tuning.json']) {
  if (existsSync(join(output, name))) unlinkSync(join(output, name));
}
for (const path of files) {
  const source = git('show', `${revision}:${path}`);
  const data = strip(JSON.parse(source.toString()));
  if (path === 'data/config.json') for (const key of ['broadcasts', 'titles', 'titleRule', 'trophies', 'rewards']) delete data[key];
  const generated = Buffer.from(JSON.stringify(data) + '\n');
  const name = path.slice(5);
  await save(join(output, name), generated);
  manifest.files[name] = { source_sha256: sha(source), generated_sha256: sha(generated), source_bytes: source.length, generated_bytes: generated.length };
}
await save(join(output, 'core-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported ${files.length} gameplay tables from ${revision}`);
