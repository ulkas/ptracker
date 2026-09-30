import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ptracker-update-smoke-'));
const releases = { A: join(temp, 'A'), B: join(temp, 'B') };
let active = 'A';
let chrome;
let server;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

async function findChrome() {
  const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const candidate of candidates) try { await access(candidate); return candidate; } catch { /* Try the next known location. */ }
  throw new Error('Chrome was not found. Set CHROME_PATH to run the PWA lifecycle smoke test.');
}

async function prepareReleases() {
  const dist = new URL('../dist/', import.meta.url);
  await Promise.all([cp(dist, releases.A, { recursive: true }), cp(dist, releases.B, { recursive: true })]);
  for (const name of ['A', 'B']) {
    const indexPath = join(releases[name], 'index.html');
    const html = await readFile(indexPath, 'utf8');
    await writeFile(indexPath, html.replace('</head>', `<meta name="smoke-release" content="${name}"></head>`));
  }
  const currentVersion = JSON.parse(await readFile(join(releases.A, 'version.json'), 'utf8')).latestVersion;
  const nextVersion = '9.9.9';
  const manifestPath = join(releases.B, 'release-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = nextVersion; manifest.buildId = 'smoke-B';
  await writeFile(manifestPath, JSON.stringify(manifest));
  const versionPath = join(releases.B, 'version.json');
  const version = JSON.parse(await readFile(versionPath, 'utf8'));
  Object.assign(version, { latestVersion: nextVersion, buildId: 'smoke-B', serviceWorker: `/ptracker/sw-${nextVersion}.js` });
  await writeFile(versionPath, JSON.stringify(version));
  await unlink(join(releases.B, `sw-${currentVersion}.js`));
  await writeFile(join(releases.B, `sw-${nextVersion}.js`), `self.__PTRACKER_RELEASE__=${JSON.stringify({ version: nextVersion, manifestUrl: '/ptracker/release-manifest.json' })};\nimportScripts('./service-worker-protocol-v1.js');\n`);
  return { currentVersion, nextVersion };
}

function startServer() {
  return new Promise((resolve) => {
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/ptracker/')) { response.writeHead(404).end(); return; }
        let relative = decodeURIComponent(url.pathname.slice('/ptracker/'.length)) || 'index.html';
        const file = join(releases[active], relative);
        const body = await readFile(file);
        const headers = { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' };
        if (basename(file) === 'version.json' || basename(file) === 'release-manifest.json') headers['Cache-Control'] = 'no-store';
        response.writeHead(200, headers); response.end(body);
      } catch { response.writeHead(404).end(); }
    }).listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

class Cdp {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (!message.id) return; const task = this.pending.get(message.id); if (!task) return; this.pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
}

async function connectCdp(port) {
  let pages = [];
  let page;
  for (let attempt = 0; attempt < 50; attempt++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); page = pages.find((candidate) => candidate.type === 'page' && candidate.url.includes('/ptracker/')); if (page) break; } catch { /* Chrome is still starting. */ } await delay(100); }
  if (!page) throw new Error('Chrome DevTools endpoint did not expose the PTracker page.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  return new Cdp(socket);
}

try {
  const { currentVersion, nextVersion } = await prepareReleases();
  const port = await startServer();
  const chromePath = await findChrome();
  const debugPort = 9337;
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(temp, 'profile')}`, `http://127.0.0.1:${port}/ptracker/?view=settings`], { stdio: 'ignore', windowsHide: true });
  const cdp = await connectCdp(debugPort);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  console.log('Chrome opened release A.');
  await delay(2500);
  await cdp.evaluate(`navigator.serviceWorker.ready.then(() => true)`);
  console.log('Release A worker is ready.');
  await cdp.evaluate(`new Promise((resolve,reject)=>{if(navigator.serviceWorker.controller)return resolve(true);const timer=setTimeout(()=>reject(new Error('controller timeout')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve(true)},{once:true})})`);
  const initial = await cdp.evaluate(`(async()=>{const registration=await navigator.serviceWorker.getRegistration('/ptracker/');return{marker:document.querySelector('meta[name="smoke-release"]')?.content,text:document.body.innerText,controlled:!!navigator.serviceWorker.controller,controller:navigator.serviceWorker.controller?.scriptURL,active:registration?.active?.scriptURL,caches:await caches.keys()}})()`);
  console.log(`Initial marker=${initial.marker} controlled=${initial.controlled} active=${initial.active}`);
  assert(initial.marker === 'A', 'Release A did not render initially.');
  assert(initial.text.includes('App & updates'), 'The update Settings UI did not render.');
  assert(initial.controlled && initial.active?.endsWith(`/ptracker/sw-${currentVersion}.js`), 'Release A worker is not controlling the app.');
  assert(initial.caches.includes(`ptracker-app-${currentVersion}`), 'Release A cache is missing.');

  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Page.reload'); await delay(900);
  assert(await cdp.evaluate(`document.querySelector('meta[name="smoke-release"]')?.content`) === 'A', 'Release A did not reopen from cache while offline.');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  active = 'B';
  await cdp.send('Page.reload'); await delay(1200);
  assert(await cdp.evaluate(`document.querySelector('meta[name="smoke-release"]')?.content`) === 'A', 'Deploying B changed the app before user approval.');

  const failedPreparation = await cdp.evaluate(`new Promise((resolve)=>{const channel=new MessageChannel();channel.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'PREPARE_UPDATE',version:'8.8.8',manifestUrl:'/ptracker/missing-release.json'},[channel.port2])})`);
  assert(failedPreparation.type === 'PREPARE_FAILED', 'A failed download did not report failure.');
  const afterFailure = await cdp.evaluate(`caches.keys()`);
  assert(afterFailure.includes(`ptracker-app-${currentVersion}`) && !afterFailure.includes('ptracker-app-8.8.8'), 'Failed preparation damaged the active cache or retained an incomplete cache.');

  const prepared = await cdp.evaluate(`new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('prepare timeout')),15000);channel.port1.onmessage=e=>{clearTimeout(timer);e.data?.type==='PREPARE_COMPLETE'?resolve(e.data):reject(new Error(e.data?.error||'prepare failed'))};navigator.serviceWorker.controller.postMessage({type:'PREPARE_UPDATE',version:'${nextVersion}',manifestUrl:'/ptracker/release-manifest.json'},[channel.port2])})`);
  assert(prepared.version === nextVersion, 'Release B did not prepare.');
  assert((await cdp.evaluate(`caches.keys()`)).includes(`ptracker-app-${nextVersion}`), 'Release B cache is missing after preparation.');
  await cdp.send('Page.reload'); await delay(1000);
  assert(await cdp.evaluate(`document.querySelector('meta[name="smoke-release"]')?.content`) === 'A', 'Prepared release activated before restart approval.');

  const waiting = await cdp.evaluate(`(async()=>{const registration=await navigator.serviceWorker.register('/ptracker/sw-${nextVersion}.js',{scope:'/ptracker/',updateViaCache:'none'});const worker=registration.waiting??registration.installing;if(!worker)throw new Error('no update worker');if(worker.state!=='installed')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('install timeout')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='installed'){clearTimeout(timer);resolve()}if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('worker redundant'))}})});return {waiting:registration.waiting?.scriptURL,controller:navigator.serviceWorker.controller?.scriptURL}})()`);
  assert(waiting.waiting?.endsWith(`/ptracker/sw-${nextVersion}.js`), 'Release B worker did not wait for approval.');
  assert(waiting.controller?.endsWith(`/ptracker/sw-${currentVersion}.js`), 'Controller changed before explicit activation.');
  await cdp.evaluate(`new Promise(async(resolve,reject)=>{const registration=await navigator.serviceWorker.getRegistration('/ptracker/');if(!registration?.waiting)return reject(new Error('no waiting worker'));navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(true),{once:true});registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});setTimeout(()=>reject(new Error('activation timeout')),15000)})`);
  await cdp.send('Page.reload'); await delay(1200);
  assert(await cdp.evaluate(`document.querySelector('meta[name="smoke-release"]')?.content`) === 'B', 'Release B did not render after explicit activation.');
  console.log('Manual update lifecycle smoke test passed: A stayed pinned until explicit B activation.');
  await cdp.send('Browser.close');
} finally {
  if (chrome && !chrome.killed) {
    chrome.kill();
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(2000)]);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  try { await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (error) { console.warn(`Temporary Chrome profile cleanup deferred: ${error.message}`); }
}
