import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AreaKey, MenuArea, MenuResponse, Permission } from '@/lib/movil/contract-empresa';
import { api } from '@/services/api';
import { useAuth } from '@/services/auth';
import { AREAS } from './nav';

/**
 * Estado compartido de la consola: áreas visibles, permisos del rol y
 * contadores de pendientes (`GET empresa/menu`). Las pestañas y entradas que el
 * rol no puede usar no se muestran; el servidor vuelve a verificar todo.
 */
interface EmpresaValue {
  menu: MenuResponse | null;
  menuError: string | null;
  can(permission: Permission): boolean;
  area(key: AreaKey): MenuArea | null;
  badge(key: AreaKey): number;
  /** El área está habilitada para el rol (menú del servidor o, mientras carga, permisos de la sesión). */
  visible(key: AreaKey): boolean;
  refreshMenu(force?: boolean): Promise<void>;
}

const Ctx = createContext<EmpresaValue | null>(null);
const MIN_INTERVAL_MS = 15_000;

export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const last = useRef(0);

  const refreshMenu = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < MIN_INTERVAL_MS) return;
    last.current = Date.now();
    try {
      setMenu(await api.get<MenuResponse>('/empresa/menu'));
      setMenuError(null);
    } catch {
      setMenuError('No pudimos actualizar los contadores.');
    }
  }, []);

  // La primera carga la hace la barra de pestañas al enfocarse; aquí se mantiene al día.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshMenu();
    });
    const timer = setInterval(() => void refreshMenu(), 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refreshMenu]);

  const value = useMemo<EmpresaValue>(() => {
    const perms = new Set<string>(menu?.permissions ?? user?.permissions ?? []);
    return {
      menu,
      menuError,
      can: (p) => perms.has(p),
      area: (key) => menu?.areas.find((a) => a.key === key) ?? null,
      badge: (key) => menu?.areas.find((a) => a.key === key)?.badge ?? 0,
      visible: (key) => {
        if (menu) return menu.areas.some((a) => a.key === key);
        const p = AREAS.find((a) => a.key === key)?.permission;
        return p === null || (p !== undefined && perms.has(p));
      },
      refreshMenu,
    };
  }, [menu, menuError, user, refreshMenu]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEmpresa(): EmpresaValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEmpresa fuera de EmpresaProvider');
  return v;
}
