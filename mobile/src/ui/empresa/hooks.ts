import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/services/api';

/**
 * GET de la consola: recarga al enfocar la pantalla y cada vez que cambia la
 * ruta (filtros, página). `stale` indica que los datos visibles son de otra
 * ruta mientras llega la nueva respuesta.
 */
export function useLoad<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; path: string | null }>({ data: null, error: null, path: null });
  const [refreshing, setRefreshing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      if (!path) return;
      const id = ++seq.current;
      if (refresh) setRefreshing(true);
      setFetching(true);
      try {
        const data = await api.get<T>(path);
        if (id === seq.current) setState({ data, error: null, path });
      } catch (e) {
        const message = e instanceof ApiError ? (e.status === 403 ? 'Tu rol no tiene permiso para ver esta información.' : e.status === 404 ? 'No encontramos este registro o está fuera de tu alcance.' : e.message) : 'No pudimos cargar la información.';
        if (id === seq.current) setState((prev) => ({ data: prev.path === path ? prev.data : null, error: message, path }));
      } finally {
        if (id === seq.current) {
          setRefreshing(false);
          setFetching(false);
        }
      }
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const stale = state.path !== path;
  return {
    data: state.data,
    error: stale ? null : state.error,
    loading: state.data === null && (state.error === null || stale),
    stale: stale || fetching,
    refreshing,
    refresh: () => load(true),
    reload: () => load(),
    setData: (data: T) => setState((prev) => ({ ...prev, data })),
  };
}

/** Texto con retardo (búsquedas): evita una petición por tecla. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

/** Construye un querystring omitiendo valores vacíos. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
