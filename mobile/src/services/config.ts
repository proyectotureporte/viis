import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra?.apiUrl as string | undefined) || 'https://app.viis.app').replace(/\/$/, '');
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
export const PLATFORM = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'otro';
/** Identifica la app en la bitácora de auditoría del servidor. */
export const USER_AGENT = `OpenV-Movil/${APP_VERSION} (${PLATFORM})`;
