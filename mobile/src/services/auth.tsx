import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, setToken, setUnauthorizedHandler } from './api';
import { PLATFORM } from './config';

/**
 * Sesión en la app:
 *  - Ingreso: contraseña → código TOTP (o alta del autenticador) → token en memoria.
 *  - "Recordar este teléfono": el servidor entrega un token de dispositivo que se
 *    guarda en el llavero PROTEGIDO POR BIOMETRÍA; al abrir la app se desbloquea
 *    con Face ID / huella y se cambia por una sesión nueva.
 *  - Tras 5 minutos en segundo plano la app se bloquea de nuevo.
 */

export interface Profile {
  id: string;
  name: string;
  firstName: string;
  email: string;
  role: string;
  roleLabel: string;
  portal: 'cliente' | 'aliado' | 'empresa';
  permissions: string[];
  organization: { id: string; name: string } | null;
  unreadNotifications: number;
}

type Status = 'booting' | 'signedOut' | 'locked' | 'mfa' | 'setupMfa' | 'signedIn';

const DEVICE_KEY = 'ov.deviceToken';
const DEVICE_META = 'ov.deviceMeta';
const LOCK_AFTER_MS = 5 * 60 * 1_000;

interface AuthValue {
  status: Status;
  user: Profile | null;
  deviceEmail: string | null;
  biometricLabel: string;
  canUseBiometrics: boolean;
  login(email: string, password: string): Promise<void>;
  verifyMfa(code: string, trust: boolean): Promise<void>;
  startMfaSetup(): Promise<{ secret: string; otpauth: string; pending: string }>;
  confirmMfaSetup(pending: string, code: string, trust: boolean): Promise<string[]>;
  finishSetup(): void;
  unlock(): Promise<void>;
  logout(forgetDevice?: boolean): Promise<void>;
  cancel(): void;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function biometricInfo() {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    return { available: hardware && enrolled && SecureStore.canUseBiometricAuthentication(), label: face ? (PLATFORM === 'ios' ? 'Face ID' : 'reconocimiento facial') : 'huella' };
  } catch {
    return { available: false, label: 'biometría' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('booting');
  const [user, setUser] = useState<Profile | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [deviceEmail, setDeviceEmail] = useState<string | null>(null);
  const [bio, setBio] = useState({ available: false, label: 'biometría' });
  const backgroundAt = useRef<number | null>(null);
  const statusRef = useRef<Status>('booting');
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearSession = useCallback((next: Status) => {
    setToken(null);
    setUser(null);
    setTicket(null);
    setStatus(next);
  }, []);

  const lockOrSignOut = useCallback(async () => {
    const meta = await SecureStore.getItemAsync(DEVICE_META).catch(() => null);
    clearSession(meta ? 'locked' : 'signedOut');
  }, [clearSession]);

  useEffect(() => {
    (async () => {
      setBio(await biometricInfo());
      const meta = await SecureStore.getItemAsync(DEVICE_META).catch(() => null);
      if (meta) setDeviceEmail((JSON.parse(meta) as { email: string }).email);
      setStatus(meta ? 'locked' : 'signedOut');
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current === 'signedIn') void lockOrSignOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [lockOrSignOut]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current && statusRef.current === 'signedIn' && Date.now() - backgroundAt.current > LOCK_AFTER_MS) {
        void lockOrSignOut();
      }
      if (state === 'active') backgroundAt.current = null;
    });
    return () => sub.remove();
  }, [lockOrSignOut]);

  const storeDevice = useCallback(async (deviceToken: string | undefined, profile: Profile) => {
    if (!deviceToken) return;
    try {
      await SecureStore.setItemAsync(DEVICE_KEY, deviceToken, {
        requireAuthentication: true,
        authenticationPrompt: 'Confirma para recordar este teléfono',
        keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(DEVICE_META, JSON.stringify({ email: profile.email, name: profile.firstName }));
      setDeviceEmail(profile.email);
    } catch {
      // Sin biometría configurada no se recuerda el teléfono; el ingreso sigue normal.
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      deviceEmail,
      biometricLabel: bio.label,
      canUseBiometrics: bio.available,
      async login(email, password) {
        const res = await api.post<{ ok: boolean; message?: string; ticket?: string; next?: 'mfa' | 'setup_mfa' }>('/auth/login', { email, password }, { auth: null });
        if (!res.ok || !res.ticket) throw new ApiError(res.message ?? 'No pudimos ingresar.', 401);
        setTicket(res.ticket);
        setStatus(res.next === 'setup_mfa' ? 'setupMfa' : 'mfa');
      },
      async verifyMfa(code, trust) {
        type MfaResponse = { ok: boolean; message?: string; lockout?: boolean; token?: string; deviceToken?: string; user?: Profile };
        let res: MfaResponse;
        try {
          res = await api.post<MfaResponse>('/auth/mfa', { code, trustDevice: trust && bio.available, deviceName: `App OpenV (${PLATFORM})`, platform: PLATFORM }, { auth: ticket });
        } catch (error) {
          // Demasiados códigos fallidos: el servidor cerró el ingreso; se vuelve a empezar.
          if (error instanceof ApiError && (error.data as { lockout?: boolean } | undefined)?.lockout) clearSession('signedOut');
          throw error;
        }
        if (!res.ok || !res.token || !res.user) {
          if (res.lockout) clearSession('signedOut');
          throw new ApiError(res.message ?? 'Código incorrecto.', 401);
        }
        setToken(res.token);
        await storeDevice(res.deviceToken, res.user);
        setUser(res.user);
        setTicket(null);
        setStatus('signedIn');
      },
      async startMfaSetup() {
        const res = await api.post<{ ok: boolean; secret: string; otpauth: string; pending: string }>('/auth/mfa-setup', {}, { auth: ticket });
        return res;
      },
      async confirmMfaSetup(pending, code, trust) {
        const res = await api.post<{ ok: boolean; message?: string; token?: string; deviceToken?: string; recoveryCodes?: string[]; user?: Profile }>(
          '/auth/mfa-confirm',
          { pending, code, trustDevice: trust && bio.available, deviceName: `App OpenV (${PLATFORM})`, platform: PLATFORM },
          { auth: ticket },
        );
        if (!res.ok || !res.token || !res.user) throw new ApiError(res.message ?? 'El código no coincide.', 422);
        setToken(res.token);
        await storeDevice(res.deviceToken, res.user);
        setUser(res.user);
        return res.recoveryCodes ?? [];
      },
      finishSetup() {
        setTicket(null);
        setStatus('signedIn');
      },
      async unlock() {
        const deviceToken = await SecureStore.getItemAsync(DEVICE_KEY, { requireAuthentication: true, authenticationPrompt: 'Desbloquea OpenV' });
        if (!deviceToken) {
          await SecureStore.deleteItemAsync(DEVICE_META).catch(() => undefined);
          setDeviceEmail(null);
          clearSession('signedOut');
          return;
        }
        try {
          const res = await api.post<{ ok: boolean; token: string; user: Profile }>('/auth/dispositivo', { deviceToken }, { auth: null });
          setToken(res.token);
          setUser(res.user);
          setStatus('signedIn');
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await SecureStore.deleteItemAsync(DEVICE_KEY).catch(() => undefined);
            await SecureStore.deleteItemAsync(DEVICE_META).catch(() => undefined);
            setDeviceEmail(null);
            clearSession('signedOut');
          }
          throw error;
        }
      },
      async logout(forgetDevice = false) {
        let deviceToken: string | null = null;
        if (forgetDevice) {
          // Para revocarlo en el servidor hay que leerlo (pide biometría); si se cancela, igual se borra local.
          deviceToken = await SecureStore.getItemAsync(DEVICE_KEY, { requireAuthentication: true, authenticationPrompt: 'Confirma para olvidar este teléfono' }).catch(() => null);
          await SecureStore.deleteItemAsync(DEVICE_KEY).catch(() => undefined);
          await SecureStore.deleteItemAsync(DEVICE_META).catch(() => undefined);
          setDeviceEmail(null);
        }
        await api.post('/auth/logout', deviceToken ? { deviceToken } : {}).catch(() => undefined);
        clearSession(forgetDevice || !deviceEmail ? 'signedOut' : 'locked');
      },
      cancel() {
        clearSession(deviceEmail ? 'locked' : 'signedOut');
      },
      async refreshUser() {
        const res = await api.get<{ ok: boolean; user: Profile }>('/yo');
        setUser(res.user);
      },
    }),
    [status, user, deviceEmail, bio, ticket, clearSession, storeDevice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth fuera de AuthProvider');
  return value;
}
