import { db } from './db';

export const APP_VERSION = __APP_VERSION__;
export const BUILD_ID = __BUILD_ID__;
export const DATABASE_VERSION = __DB_VERSION__;
export const UPDATE_METADATA_KEY = 'update';
export const PASSIVE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type UpdateStatus = 'IDLE' | 'CHECKING' | 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'PREPARING' | 'DOWNLOADING' | 'READY_TO_ACTIVATE' | 'ACTIVATING' | 'MIGRATING' | 'SUCCESS' | 'FAILED' | 'OFFLINE';

export interface ReleaseMetadata {
  latestVersion: string;
  releasedAt: string;
  minimumSupportedVersion: string;
  releaseNotes: string[];
  databaseMigration: boolean;
  backupRecommended: boolean;
  releaseManifest: string;
  serviceWorker: string;
  buildId: string;
  databaseVersion: number;
}

export interface UpdateMetadata {
  currentVersion: string;
  availableVersion?: string;
  availableRelease?: ReleaseMetadata;
  latestCheckAt?: string;
  updateDetectedAt?: string;
  updateStartedAt?: string;
  updateCompletedAt?: string;
  previousVersion?: string;
  targetVersion?: string;
  preparedVersion?: string;
  lastFailure?: string;
}

export interface UpdateState { status: UpdateStatus; error?: string; }

type Semver = { major: number; minor: number; patch: number; prerelease: string[] };

export function parseSemver(value: string): Semver | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4]?.split('.') ?? [] };
}

export function compareSemver(left: string, right: string) {
  const a = parseSemver(left), b = parseSemver(right);
  if (!a || !b) throw new Error('Invalid semantic version metadata.');
  for (const key of ['major', 'minor', 'patch'] as const) if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index++) {
    const av = a.prerelease[index], bv = b.prerelease[index];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;
    const an = /^\d+$/.test(av), bn = /^\d+$/.test(bv);
    if (an && bn) return Number(av) > Number(bv) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return av > bv ? 1 : -1;
  }
  return 0;
}

export function validateReleaseMetadata(value: unknown): ReleaseMetadata {
  if (!value || typeof value !== 'object') throw new Error('The update server returned invalid metadata.');
  const release = value as Partial<ReleaseMetadata>;
  if (!release.latestVersion || !parseSemver(release.latestVersion)) throw new Error('The available application version is invalid.');
  if (!release.minimumSupportedVersion || !parseSemver(release.minimumSupportedVersion)) throw new Error('The minimum application version is invalid.');
  if (!release.releasedAt || Number.isNaN(Date.parse(release.releasedAt))) throw new Error('The release timestamp is invalid.');
  if (!Array.isArray(release.releaseNotes) || release.releaseNotes.some((note) => typeof note !== 'string')) throw new Error('The release notes are invalid.');
  if (typeof release.releaseManifest !== 'string' || typeof release.serviceWorker !== 'string') throw new Error('The release asset locations are missing.');
  if (typeof release.buildId !== 'string' || typeof release.databaseVersion !== 'number') throw new Error('The release build information is missing.');
  if (typeof release.databaseMigration !== 'boolean' || typeof release.backupRecommended !== 'boolean') throw new Error('The release safety information is missing.');
  return release as ReleaseMetadata;
}

export function shouldRunPassiveCheck(metadata: UpdateMetadata | undefined, now = Date.now()) {
  if (!metadata?.latestCheckAt) return true;
  const checked = Date.parse(metadata.latestCheckAt);
  return Number.isNaN(checked) || now - checked >= PASSIVE_CHECK_INTERVAL_MS;
}

export async function fetchReleaseMetadata(fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Update check returned HTTP ${response.status}.`);
  return validateReleaseMetadata(await response.json());
}

export function stateFromMetadata(metadata?: UpdateMetadata): UpdateState {
  if (metadata?.preparedVersion && metadata.preparedVersion === metadata.availableVersion) return { status: 'READY_TO_ACTIVATE' };
  if (metadata?.availableVersion && compareSemver(metadata.availableVersion, APP_VERSION) > 0) return { status: 'UPDATE_AVAILABLE' };
  return { status: 'IDLE' };
}

export async function getUpdateMetadata(): Promise<UpdateMetadata | undefined> {
  return (await db.appMetadata.get(UPDATE_METADATA_KEY))?.value as UpdateMetadata | undefined;
}

export async function saveUpdateMetadata(metadata: UpdateMetadata) {
  await db.appMetadata.put({ key: UPDATE_METADATA_KEY, value: metadata });
}

export async function verifyLocalDatabase() {
  await db.open();
  const expected = ['pokerRooms', 'sessions', 'sessionCashEvents', 'sessionBreaks', 'hands', 'allIns', 'players', 'bankrollEvents', 'settings', 'appMetadata'];
  const actual = new Set(db.tables.map((table) => table.name));
  if (expected.some((name) => !actual.has(name))) throw new Error('The local database is missing an expected table.');
  await db.sessions.filter((session) => session.active).toArray();
}

export async function requestReleasePreparation(release: ReleaseMetadata) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) throw new Error('The installed app is not controlled by its offline worker yet. Close and reopen PTracker, then try again.');
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error('The update download did not finish in time.')), 120_000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      if (event.data?.type === 'PREPARE_COMPLETE') resolve();
      else reject(new Error(event.data?.error || 'The update could not be prepared.'));
    };
    controller.postMessage({ type: 'PREPARE_UPDATE', version: release.latestVersion, manifestUrl: release.releaseManifest }, [channel.port2]);
  });
}

async function waitForWaitingWorker(registration: ServiceWorkerRegistration, expectedUrl: string) {
  if (registration.waiting?.scriptURL.endsWith(expectedUrl)) return registration.waiting;
  const worker = registration.installing;
  if (!worker) throw new Error('The new application worker did not begin installing.');
  return new Promise<ServiceWorker>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The new application worker did not become ready.')), 60_000);
    const inspect = () => {
      if (worker.state === 'installed' && registration.waiting) { window.clearTimeout(timeout); resolve(registration.waiting); }
      if (worker.state === 'redundant') { window.clearTimeout(timeout); reject(new Error('The new application worker was rejected.')); }
    };
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}

export async function activatePreparedRelease(release: ReleaseMetadata) {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support application updates.');
  const base = import.meta.env.BASE_URL;
  const expectedPath = new URL(release.serviceWorker, location.origin).pathname;
  const reloadKey = `ptracker:update-reload:${release.latestVersion}`;
  await new Promise<void>(async (resolve, reject) => {
    let changed = false;
    const timeout = window.setTimeout(() => { if (!changed) reject(new Error('The application did not switch to the new version.')); }, 60_000);
    const onControllerChange = () => {
      if (changed) return;
      changed = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (!sessionStorage.getItem(reloadKey)) { sessionStorage.setItem(reloadKey, '1'); location.reload(); }
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    try {
      const registration = await navigator.serviceWorker.register(release.serviceWorker, { scope: base, updateViaCache: 'none' });
      const waiting = await waitForWaitingWorker(registration, expectedPath);
      waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    } catch (reason) {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      reject(reason);
    }
  });
}

export function confirmWorkerStartup() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'UPDATE_CONFIRMED', version: APP_VERSION });
  sessionStorage.removeItem(`ptracker:update-reload:${APP_VERSION}`);
}
