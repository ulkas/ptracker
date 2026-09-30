import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) files.push(...(entry.isDirectory() ? await walk(join(dir, entry.name)) : [join(dir, entry.name)]));
  return files;
}
const files = (await walk(root)).filter((file) => !file.endsWith('service-worker.js') && !file.endsWith('.map'))
  .map((file) => `/ptracker/${relative(root, file).replaceAll('\\', '/')}`);
const target = new URL('../dist/service-worker.js', import.meta.url);
const source = await readFile(target, 'utf8');
await writeFile(target, source.replace("/*__PRECACHE__*/ [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`, `${BASE}icons/icon.svg`]", JSON.stringify(files)), 'utf8');
console.log(`Service worker precaches ${files.length} files.`);
