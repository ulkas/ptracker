import { useCallback, useEffect, useState } from 'react';
import { readAllData } from './db';
import type { AppData } from './types';
import { ensureDatabaseState } from './records';

const empty: AppData = { pokerRooms: [], sessions: [], sessionCashEvents: [], sessionBreaks: [], hands: [], allIns: [], players: [], bankrollEvents: [], settings: [] };

export function useData() {
  const [data, setData] = useState<AppData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refresh = useCallback(() => ensureDatabaseState().then(() => readAllData()).then((value) => { setData(value); setError(null); }).catch((reason: unknown) => setError(reason instanceof Error ? reason : new Error('The local database could not be opened.'))).finally(() => setLoading(false)), []);
  useEffect(() => {
    void refresh();
    window.addEventListener('ptracker:db-change', refresh);
    return () => window.removeEventListener('ptracker:db-change', refresh);
  }, [refresh]);
  return { data, loading, error, refresh };
}
