import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { api, ApiError, type ActionResult } from './api';

/** GET con recarga al enfocar la pantalla y "tirar para actualizar". */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (!path) return;
      if (refresh) setRefreshing(true);
      try {
        setData(await api.get<T>(path));
        setError(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No pudimos cargar la información.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, error, loading, refreshing, refresh: () => load(true), reload: () => load(), setData };
}

/** Mutación que devuelve {ok, message}; vibra según el resultado. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = useCallback(async (path: string, body?: Record<string, unknown> | FormData): Promise<ActionResult> => {
    setPending(true);
    try {
      const res = await api.post<ActionResult>(path, body);
      setResult(res);
      void Haptics.notificationAsync(res.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      return res;
    } catch (e) {
      const res = { ok: false, message: e instanceof ApiError ? e.message : 'No pudimos completar la acción.' };
      setResult(res);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return res;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, result, clear: () => setResult(null) };
}
