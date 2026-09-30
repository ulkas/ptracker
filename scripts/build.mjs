import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const dist = join(root, 'dist');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
const now = new Date();
const buildId = now.toISOString().replace(/[-:]/g, '').replace('T', '.').slice(0, 13);
const environment = { ...process.env, PTRACKER_BUILD_ID: buildId };

function run(binary, args) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const executable = join(root, 'node_modules', '.bin', `${binary}${suffix}`);
  const result = process.platform === 'win32'
    ? spawnSync(`"${executable}" ${args.join(' ')}`, { cwd: root, env: environment, stdio: 'inherit', shell: true })
    : spawnSync(executable, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('tsc', ['-b']);
run('vite', ['build']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) files.push(...(entry.isDirectory() ? await walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return files;
}

const basePath = release.basePath.endsWith('/') ? release.basePath : `${release.basePath}/`;
const assets = (await walk(dist))
  .filter((file) => !file.endsWith('.map') && !/service-worker-protocol-v\d+\.js$/.test(file))
  .map((file) => `${basePath}${relative(dist, file).replaceAll('\\', '/')}`)
  .filter((url) => !/\/(version|release-manifest)\.json$/.test(url) && !/\/sw-[^/]+\.js$/.test(url))
  .sort();
if (!assets.some((url) => url.endsWith('/index.html')) || !assets.some((url) => /\/assets\/.*\.js$/.test(url))) throw new Error('The release manifest is missing the application shell.');

const manifestPath = `${basePath}release-manifest.json`;
const workerPath = `${basePath}sw-${packageJson.version}.js`;
const releaseManifest = { application: 'poker-tracker', version: packageJson.version, buildId, assets };
const versionMetadata = {
  latestVersion: packageJson.version,
  releasedAt: release.releasedAt,
  minimumSupportedVersion: release.minimumSupportedVersion,
  releaseNotes: release.releaseNotes,
  databaseMigration: release.databaseMigration,
  backupRecommended: release.backupRecommended,
  releaseManifest: manifestPath,
  serviceWorker: workerPath,
  buildId,
  databaseVersion: release.databaseVersion,
};
const workerWrapper = `self.__PTRACKER_RELEASE__=${JSON.stringify({ version: packageJson.version, manifestUrl: manifestPath })};\nimportScripts('./service-worker-protocol-v1.js');\n`;

await Promise.all([
  writeFile(join(dist, 'release-manifest.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`, 'utf8'),
  writeFile(join(dist, 'version.json'), `${JSON.stringify(versionMetadata, null, 2)}\n`, 'utf8'),
  writeFile(join(dist, `sw-${packageJson.version}.js`), workerWrapper, 'utf8'),
]);

const protocol = await readFile(join(dist, 'service-worker-protocol-v1.js'), 'utf8');
if (/install[\s\S]{0,500}skipWaiting/.test(protocol)) throw new Error('The worker protocol must not activate during installation.');
if (!protocol.includes('PREPARE_UPDATE') || !protocol.includes('ACTIVATE_UPDATE') || !protocol.includes('UPDATE_CONFIRMED')) throw new Error('The worker protocol is missing manual-update messages.');
console.log(`Built PTracker ${packageJson.version} (${buildId}) with ${assets.length} cached shell files.`);
