import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_VERSION, compareSemver, fetchReleaseMetadata, normalizeUpdateMetadata, parseSemver, releaseMetadataUrl, shouldRunPassiveCheck, stateFromMetadata, validateReleaseMetadata, workerUrl, type ReleaseMetadata } from '../src/update';

const release = (version = '9.10.2'): ReleaseMetadata => ({
  latestVersion: version,
  releasedAt: '2026-09-30T18:00:00Z',
  minimumSupportedVersion: '0.1.0',
  releaseNotes: ['Safe manual update'],
  databaseMigration: false,
  backupRecommended: true,
  releaseManifest: '/ptracker/release-manifest.json',
  serviceWorker: `/ptracker/sw-${version}.js`,
  buildId: '20260930.1800',
  databaseVersion: 4,
});

describe('semantic version comparison', () => {
  it('compares numeric components rather than strings', () => { expect(compareSemver('1.10.0', '1.9.9')).toBe(1); expect(compareSemver('2.0.0', '10.0.0')).toBe(-1); });
  it('orders prereleases according to semantic version rules', () => { expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1); expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBe(1); });
  it('handles equality and rejects invalid versions', () => { expect(compareSemver('1.2.3+build.5', '1.2.3+build.8')).toBe(0); expect(parseSemver('1.2')).toBeNull(); expect(() => compareSemver('latest', '1.0.0')).toThrow(/Invalid/); });
});

describe('metadata-only detection', () => {
  it('builds versioned worker URLs for registration migration', () => { expect(workerUrl('0.3.2', '/ptracker/')).toBe('/ptracker/sw-0.3.2.js'); });
  it('fetches only no-cache version metadata', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(release()), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await fetchReleaseMetadata(fetcher as typeof fetch);
    expect(result.latestVersion).toBe('9.10.2');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/version.json');
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('?');
    expect(fetcher.mock.calls[0]?.[1]).toEqual({ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
  });
  it('resolves the deployed metadata endpoint without query parameters', () => { expect(releaseMetadataUrl('/ptracker/')).toBe('/ptracker/version.json'); });
  it('validates the release contract', () => { expect(validateReleaseMetadata(release())).toEqual(release()); expect(() => validateReleaseMetadata({ ...release(), latestVersion: 'next' })).toThrow(/version/); });
});

describe('persisted updater state', () => {
  it('throttles passive attempts for 24 hours after success or failure', () => { const now = Date.now(); expect(shouldRunPassiveCheck({ currentVersion: APP_VERSION, lastUpdateCheckAt: new Date(now - 23 * 60 * 60 * 1000).toISOString(), lastUpdateCheckFailedAt: new Date(now - 23 * 60 * 60 * 1000).toISOString() }, now)).toBe(false); expect(shouldRunPassiveCheck({ currentVersion: APP_VERSION, lastUpdateCheckAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() }, now)).toBe(true); });
  it('normalizes legacy check timestamps without losing update state', () => { const normalized = normalizeUpdateMetadata({ currentVersion: APP_VERSION, latestCheckAt: '2026-09-29T12:00:00.000Z', availableVersion: '9.0.0' }); expect(normalized.lastUpdateCheckAt).toBe('2026-09-29T12:00:00.000Z'); expect(normalized.latestCheckAt).toBeUndefined(); expect(normalized.availableVersion).toBe('9.0.0'); });
  it('restores available and prepared states', () => { expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: '9.0.0' }).status).toBe('UPDATE_AVAILABLE'); expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: '9.0.0', preparedVersion: '9.0.0' }).status).toBe('READY_TO_ACTIVATE'); });
  it('does not show an indicator for current or older versions', () => { expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: APP_VERSION }).status).toBe('IDLE'); expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: '0.1.0' }).status).toBe('IDLE'); });
});

describe('immutable worker protocol', () => {
  const source = readFileSync(new URL('../public/service-worker-protocol-v1.js', import.meta.url), 'utf8');
  it('never activates from the install handler', () => { const install = source.slice(source.indexOf("addEventListener('install'"), source.indexOf("addEventListener('activate'")); expect(install).not.toContain('skipWaiting'); });
  it('requires explicit activation and delayed cleanup messages', () => { expect(source).toContain("message?.type === 'ACTIVATE_UPDATE'"); expect(source).toContain("message?.type === 'UPDATE_CONFIRMED'"); });
  it('serves navigation from the selected version cache', () => { expect(source).toContain("event.request.mode === 'navigate'"); expect(source).toContain('caches.open(CURRENT_CACHE)'); });
});

describe('legacy worker migration safeguards', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const exampleProxy = readFileSync(new URL('../deploy/nginx-ptracker.conf.example', import.meta.url), 'utf8');
  it('checks the active registration instead of only registering when absent', () => { expect(main).toContain('ensureCurrentWorker'); expect(main).not.toContain('if (!registration) return navigator.serviceWorker.register'); });
  it('does not serve the obsolete worker path through the SPA fallback', () => { expect(exampleProxy).toContain('location = /ptracker/service-worker.js'); expect(exampleProxy).toContain('return 404;'); });
});

describe('installed mobile gesture policy', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  it('suppresses root overscroll without JavaScript touch interception', () => {
    expect(styles).toMatch(/html\s*\{[^}]*overscroll-behavior:\s*none/);
    expect(styles).toMatch(/body\s*\{[^}]*overscroll-behavior:\s*none/);
    expect(readFileSync(new URL('../src/App2.tsx', import.meta.url), 'utf8')).not.toMatch(/touchmove|preventDefault\s*\(\s*\)/);
  });
});
