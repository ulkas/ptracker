import { useCallback, useEffect, useState } from 'react';
import { readAllData } from './db';
import type { AppData } from './types';
import { ensureDatabaseState } from './records';

const empty: AppData = { pokerRooms: [], sessions: [], sessionCashEvents: [], sessionBreaks: [], hands: [], allIns: [], players: [], bankrollEvents: [], settings: [] };

export function useData() {
  const [data, setData] = useState<AppData>(empty);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => ensureDatabaseState().then(() => readAllData()).then(setData).finally(() => setLoading(false)), []);
  useEffect(() => {
    void refresh();
    window.addEventListener('ptracker:db-change', refresh);
    return () => window.removeEventListener('ptracker:db-change', refresh);
  }, [refresh]);
  return { data, loading, refresh };
}
