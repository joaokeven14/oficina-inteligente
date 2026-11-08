import { useEffect } from 'react';
import { AppState } from 'react-native';
import { subscribeWorkshopLiveUpdates, type WorkshopLiveTable } from '../services/workshopData';

export function useWorkshopLiveRefresh(workshopId: string, tables: readonly WorkshopLiveTable[], refresh: () => Promise<void>, enabled = true) {
  const tableKey = tables.join(',');

  useEffect(() => {
    if (!workshopId || !enabled) return undefined;
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (active) void refresh(); }, 150);
    };
    const subscribedTables = Array.from(new Set<WorkshopLiveTable>([
      ...(tableKey.split(',') as WorkshopLiveTable[]),
      'workshop_member_permissions', 'workshop_memberships', 'workshops',
    ]));
    const unsubscribe = subscribeWorkshopLiveUpdates(workshopId, subscribedTables, scheduleRefresh);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleRefresh();
    });
    const refreshInterval = setInterval(scheduleRefresh, 60_000);
    const handleFocus = () => scheduleRefresh();
    const handleVisibility = () => { if (document.visibilityState === 'visible') scheduleRefresh(); };
    if (typeof window !== 'undefined') window.addEventListener('focus', handleFocus);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(refreshInterval);
      unsubscribe();
      appStateSubscription.remove();
      if (typeof window !== 'undefined') window.removeEventListener('focus', handleFocus);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, refresh, tableKey, workshopId]);
}
