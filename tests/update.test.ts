import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_VERSION, compareSemver, fetchReleaseMetadata, parseSemver, shouldRunPassiveCheck, stateFromMetadata, validateReleaseMetadata, type ReleaseMetadata } from '../src/update';

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
  it('fetches only no-cache version metadata', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(release()), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await fetchReleaseMetadata(fetcher as typeof fetch);
    expect(result.latestVersion).toBe('9.10.2');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/version\.json\?t=/);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });
  it('validates the release contract', () => { expect(validateReleaseMetadata(release())).toEqual(release()); expect(() => validateReleaseMetadata({ ...release(), latestVersion: 'next' })).toThrow(/version/); });
});

describe('persisted updater state', () => {
  it('throttles passive checks for 24 hours', () => { const now = Date.now(); expect(shouldRunPassiveCheck({ currentVersion: APP_VERSION, latestCheckAt: new Date(now - 23 * 60 * 60 * 1000).toISOString() }, now)).toBe(false); expect(shouldRunPassiveCheck({ currentVersion: APP_VERSION, latestCheckAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() }, now)).toBe(true); });
  it('restores available and prepared states', () => { expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: '9.0.0' }).status).toBe('UPDATE_AVAILABLE'); expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: '9.0.0', preparedVersion: '9.0.0' }).status).toBe('READY_TO_ACTIVATE'); });
  it('does not show an indicator for current or older versions', () => { expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: APP_VERSION }).status).toBe('IDLE'); expect(stateFromMetadata({ currentVersion: APP_VERSION, availableVersion: '0.1.0' }).status).toBe('IDLE'); });
});

describe('immutable worker protocol', () => {
  const source = readFileSync(new URL('../public/service-worker-protocol-v1.js', import.meta.url), 'utf8');
  it('never activates from the install handler', () => { const install = source.slice(source.indexOf("addEventListener('install'"), source.indexOf("addEventListener('activate'")); expect(install).not.toContain('skipWaiting'); });
  it('requires explicit activation and delayed cleanup messages', () => { expect(source).toContain("message?.type === 'ACTIVATE_UPDATE'"); expect(source).toContain("message?.type === 'UPDATE_CONFIRMED'"); });
  it('serves navigation from the selected version cache', () => { expect(source).toContain("event.request.mode === 'navigate'"); expect(source).toContain('caches.open(CURRENT_CACHE)'); });
});
