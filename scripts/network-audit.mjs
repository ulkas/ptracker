import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const failures = [];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.ts', '.tsx', '.webmanifest']);
const forbiddenCode = [
  /\baxios\b/i, /\bXMLHttpRequest\b/, /\.sendBeacon\s*\(/, /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/, /\bWebTransport\s*\(/, /serviceWorker\.update\s*\(/,
  /registration\.update\s*\(/, /sync\.register\s*\(/, /\bperiodicSync\b/,
  /\bbackgroundFetch\b/, /\bpushManager\b/i, /\bPushManager\b/,
  /\b(gtag|sentry|posthog|mixpanel|amplitude|hotjar|clarity|firebase)\b/i,
];
const forbiddenPackages = ['axios', 'firebase', 'sentry', 'posthog', 'mixpanel', 'amplitude', 'hotjar', 'clarity', 'datadog', 'newrelic', 'matomo'];
// These are inert library/DOM identifiers or diagnostic text, never request destinations.
const allowedExternalUrls = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'https://react.dev/errors/',
  'https://tinyurl.com/y2uuvskb',
  'http://bit.ly/2kdckMn',
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) files.push(...(entry.isDirectory() ? await walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return files;
}

function lineOf(content, index) { return content.slice(0, index).split('\n').length; }
function fail(file, message) { failures.push(`${relative(root, file)}: ${message}`); }

function auditRuntimeFile(file, content) {
  let inspected = content;
  const normalizedPath = relative(root, file).replaceAll('\\', '/');
  if (normalizedPath === 'public/service-worker-protocol-v1.js' || normalizedPath === 'dist/service-worker-protocol-v1.js') {
    const approved = [
      "fetch(scopedUrl(manifestUrl), { cache: 'no-store', headers: { Accept: 'application/json' } })",
      "fetch(asset, { cache: 'reload' })",
      "fetch(event.request, { cache: 'no-store' })",
      'cached || fetch(event.request)',
    ];
    for (const snippet of approved) inspected = inspected.replaceAll(snippet, 'APPROVED_NETWORK_REQUEST');
  }
  if (normalizedPath.startsWith('dist/assets/') && normalizedPath.endsWith('.js')) {
    const preloadFetches = inspected.match(/fetch\(([A-Za-z_$][\w$]*)\.href,([A-Za-z_$][\w$]*)\)/g) ?? [];
    if (preloadFetches.length > 1) fail(file, 'more than one Vite module-preload fetch was emitted');
    for (const snippet of preloadFetches) inspected = inspected.replace(snippet, 'APPROVED_VITE_MODULE_PRELOAD');
    if (preloadFetches.length && !content.includes('relList') ) fail(file, 'unrecognized generated preload fetch');
    if (!content.includes('version.json') || !content.includes('credentials:"omit"') || !content.includes('referrerPolicy:"no-referrer"')) fail(file, 'approved metadata-only update request is missing from the bundle');
  }
  const fetchMatch = /\bfetch\s*\(/g;
  for (const match of inspected.matchAll(fetchMatch)) fail(file, `unapproved fetch() at line ${lineOf(inspected, match.index ?? 0)}`);
  for (const pattern of forbiddenCode) {
    const match = pattern.exec(content);
    if (match) fail(file, `forbidden network capability "${match[0]}" at line ${lineOf(content, match.index)}`);
  }
  const urls = content.match(/(?:https?|wss?):\/\/[^\s"'`<>)}\]]+/g) ?? [];
  for (const raw of urls) {
    const url = raw.replace(/[;,]+$/, '');
    if (!allowedExternalUrls.has(url)) fail(file, `unreviewed external URL ${url}`);
  }
}

const runtimeRoots = ['src', 'public'].map((path) => join(root, path));
const runtimeFiles = [join(root, 'index.html'), ...(await Promise.all(runtimeRoots.map(walk))).flat()]
  .filter((file) => textExtensions.has(extname(file)));
for (const file of runtimeFiles) auditRuntimeFile(file, await readFile(file, 'utf8'));

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const directPackages = [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})];
for (const dependency of directPackages) if (forbiddenPackages.some((name) => dependency.toLowerCase().includes(name))) fail(join(root, 'package.json'), `forbidden dependency ${dependency}`);

const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  if (forbiddenPackages.some((vendor) => name.toLowerCase().includes(vendor))) fail(join(root, 'package-lock.json'), `forbidden package ${name}`);
  if (entry && typeof entry === 'object' && 'resolved' in entry && typeof entry.resolved === 'string' && !entry.resolved.startsWith('https://registry.npmjs.org/')) fail(join(root, 'package-lock.json'), `unreviewed package source ${entry.resolved}`);
}
const allowedLockUrlPrefixes = ['https://registry.npmjs.org/', 'https://github.com/sponsors/', 'https://github.com/vitejs/vite?sponsor=', 'https://opencollective.com/', 'https://tidelift.com/funding/'];
const lockUrls = JSON.stringify(lock).match(/https?:\/\/[^"\\\s]+/g) ?? [];
for (const url of lockUrls) if (!allowedLockUrlPrefixes.some((prefix) => url.startsWith(prefix))) fail(join(root, 'package-lock.json'), `unreviewed lockfile URL ${url}`);

const dist = join(root, 'dist');
try {
  const distFiles = (await walk(dist)).filter((file) => textExtensions.has(extname(file)));
  for (const file of distFiles) {
    if (file.endsWith('.map')) fail(file, 'production source maps are not allowed');
    auditRuntimeFile(file, await readFile(file, 'utf8'));
  }
  const productionText = (await Promise.all(distFiles.map((file) => readFile(file, 'utf8')))).join('\n');
  if (/https?:\/\/(?:localhost|127\.0\.0\.1)|@vite\/client|vite\/dist\/client|wss?:\/\//i.test(productionText)) fail(dist, 'development URL, HMR client, or WebSocket reference found in production output');
} catch { fail(dist, 'production build is missing; run npm run build before the standalone audit'); }

if (failures.length) {
  console.error(`Network audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('Network audit passed: runtime requests and external URLs are limited to the reviewed update system.');
