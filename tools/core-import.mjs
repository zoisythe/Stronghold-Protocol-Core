// Reimport the retained generated tables from an immutable Git source revision.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ref = process.argv[2] || JSON.parse(readFileSync(join(root, 'data/core-manifest.json'), 'utf8')).source_revision;
const output = resolve(process.argv[3] || join(root, 'data'));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
const revision = git('rev-parse', `${ref}^{commit}`).toString().trim();
const files = git('ls-tree', '-r', '--name-only', revision, '--', 'data').toString().trim().split('\n')
  .filter((name) => /^data\/[^/]+\.json$/.test(name) && !['data/assets.json', 'data/local-assets.json', 'data/emotes.json', 'data/tuning.json', 'data/local-fx.json', 'data/core-manifest.json'].includes(name));
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
for (const name of ['assets.json', 'local-assets.json', 'emotes.json', 'tuning.json', 'local-fx.json']) {
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
// Retain immutable English localization and its pure overlay implementation.
mkdirSync(join(output, 'i18n'), { recursive: true });
for (const [sourcePath, destination] of [
  ['data/i18n/en.json', join(output, 'i18n/en.json')],
  ['public/i18n/en.json', join(output, 'i18n/ui-en.json')],
  ['shared/i18nData.js', join(root, 'shared/i18nData.js')],
]) {
  const bytes = git('show', `${revision}:${sourcePath}`);
  await save(destination, bytes);
  manifest.files[sourcePath] = { source_sha256: sha(bytes), generated_sha256: sha(bytes), source_bytes: bytes.length, generated_bytes: bytes.length };
}
await save(join(output, 'core-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported ${files.length} gameplay tables from ${revision}`);
