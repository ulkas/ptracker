import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION, activatePreparedRelease, compareSemver, confirmWorkerStartup, fetchReleaseMetadata, getUpdateMetadata, requestReleasePreparation, saveUpdateMetadata, shouldRunPassiveCheck, stateFromMetadata, verifyLocalDatabase, type ReleaseMetadata, type UpdateMetadata, type UpdateState } from './update';

export interface UpdaterController {
  state: UpdateState;
  metadata?: UpdateMetadata;
  release?: ReleaseMetadata;
  hasUpdate: boolean;
  check: (manual?: boolean) => Promise<void>;
  prepare: () => Promise<void>;
  activate: () => Promise<void>;
  later: () => void;
  dismissSuccess: () => void;
}

export function useUpdater(databaseReady: boolean): UpdaterController {
  const [metadata, setMetadata] = useState<UpdateMetadata>();
  const [state, setState] = useState<UpdateState>({ status: 'IDLE' });
  const persist = useCallback(async (next: UpdateMetadata) => { await saveUpdateMetadata(next); setMetadata(next); }, []);

  const check = useCallback(async (manual = true) => {
    if (manual) setState({ status: 'CHECKING' });
    if (!navigator.onLine) { if (manual) setState({ status: 'OFFLINE' }); return; }
    try {
      const release = await fetchReleaseMetadata();
      const checkedAt = new Date().toISOString();
      const current: UpdateMetadata = metadata ?? { currentVersion: APP_VERSION };
      if (compareSemver(release.latestVersion, APP_VERSION) > 0) {
        const next = { ...current, currentVersion: APP_VERSION, availableVersion: release.latestVersion, availableRelease: release, latestCheckAt: checkedAt, updateDetectedAt: current.updateDetectedAt ?? checkedAt, lastFailure: undefined };
        await persist(next); setState({ status: next.preparedVersion === release.latestVersion ? 'READY_TO_ACTIVATE' : 'UPDATE_AVAILABLE' });
      } else {
        const next = { ...current, currentVersion: APP_VERSION, availableVersion: undefined, availableRelease: undefined, preparedVersion: undefined, latestCheckAt: checkedAt, updateDetectedAt: undefined, lastFailure: undefined };
        await persist(next); setState({ status: 'UP_TO_DATE' });
      }
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : 'Unable to check for updates.';
      if (manual) setState({ status: navigator.onLine ? 'FAILED' : 'OFFLINE', error });
    }
  }, [metadata, persist]);

  const prepare = useCallback(async () => {
    const release = metadata?.availableRelease;
    if (!release) { setState({ status: 'FAILED', error: 'No available release metadata was found.' }); return; }
    if (metadata.preparedVersion === release.latestVersion) { setState({ status: 'READY_TO_ACTIVATE' }); return; }
    try {
      setState({ status: 'PREPARING' }); await verifyLocalDatabase();
      const started = new Date().toISOString();
      await persist({ ...metadata, currentVersion: APP_VERSION, previousVersion: APP_VERSION, targetVersion: release.latestVersion, updateStartedAt: started, updateCompletedAt: undefined, lastFailure: undefined });
      setState({ status: 'DOWNLOADING' }); await requestReleasePreparation(release);
      const next = { ...metadata, currentVersion: APP_VERSION, previousVersion: APP_VERSION, targetVersion: release.latestVersion, preparedVersion: release.latestVersion, updateStartedAt: started, updateCompletedAt: undefined, lastFailure: undefined };
      await persist(next); setState({ status: 'READY_TO_ACTIVATE' });
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : 'The update could not be prepared.';
      await persist({ ...(metadata ?? { currentVersion: APP_VERSION }), lastFailure: error }); setState({ status: 'FAILED', error });
    }
  }, [metadata, persist]);

  const activate = useCallback(async () => {
    const release = metadata?.availableRelease;
    if (!release || metadata.preparedVersion !== release.latestVersion) { setState({ status: 'FAILED', error: 'Download the update before restarting.' }); return; }
    try {
      setState({ status: 'ACTIVATING' }); await verifyLocalDatabase();
      await persist({ ...metadata, previousVersion: APP_VERSION, targetVersion: release.latestVersion, updateStartedAt: metadata.updateStartedAt ?? new Date().toISOString(), lastFailure: undefined });
      await activatePreparedRelease(release);
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : 'The application could not activate the update.';
      await persist({ ...metadata, lastFailure: error }); setState({ status: 'FAILED', error });
    }
  }, [metadata, persist]);

  useEffect(() => {
    if (!databaseReady) return;
    let cancelled = false;
    void (async () => {
      const stored = await getUpdateMetadata();
      if (cancelled) return;
      const initial: UpdateMetadata = stored ?? { currentVersion: APP_VERSION };
      setMetadata(initial); setState(stateFromMetadata(initial));
      if (initial.targetVersion === APP_VERSION && initial.updateStartedAt && !initial.updateCompletedAt) {
        setState({ status: 'MIGRATING' });
        try {
          await verifyLocalDatabase();
          const completed = { ...initial, currentVersion: APP_VERSION, availableVersion: undefined, availableRelease: undefined, preparedVersion: undefined, updateCompletedAt: new Date().toISOString(), lastFailure: undefined };
          await persist(completed); confirmWorkerStartup(); setState({ status: 'SUCCESS' });
        } catch (reason) { setState({ status: 'FAILED', error: reason instanceof Error ? reason.message : 'The database migration could not be completed.' }); }
      } else if (shouldRunPassiveCheck(initial)) {
        await check(false);
      }
    })();
    return () => { cancelled = true; };
  }, [databaseReady]); // The initial check intentionally runs once per database startup.

  const release = metadata?.availableRelease;
  const hasUpdate = useMemo(() => Boolean(metadata?.availableVersion && compareSemver(metadata.availableVersion, APP_VERSION) > 0), [metadata]);
  return { state, metadata, release, hasUpdate, check, prepare, activate, later: () => setState({ status: 'IDLE' }), dismissSuccess: () => setState({ status: 'IDLE' }) };
}
