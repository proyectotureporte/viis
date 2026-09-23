import { Image } from 'expo-image';

/** Logo oficial de OpenV (el mismo del sitio web). */
export function Brand({ height = 40, symbolOnly = false }: { height?: number; symbolOnly?: boolean }) {
  return symbolOnly ? (
    <Image source={require('@/assets/images/symbol.png')} style={{ width: height, height }} contentFit="contain" accessibilityLabel="OpenV" />
  ) : (
    <Image source={require('@/assets/images/logo-openv.png')} style={{ width: (height * 640) / 228, height }} contentFit="contain" accessibilityLabel="OpenV" />
  );
}
