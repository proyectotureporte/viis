/** Paleta del MVP entregado (navy + menta) y tipografías de marca. */
export const colors = {
  ink: '#0b2533',
  navy: '#0c2b3b',
  navy2: '#154f61',
  blue: '#195f78',
  mint: '#18c6a3',
  mintDeep: '#0b8e74',
  sky: '#eaf6f7',
  mist: '#f4f7f8',
  bg: '#eef4f5',
  line: '#d8e3e7',
  muted: '#56686f',
  white: '#ffffff',
  danger: '#b73c3c',
  dangerSoft: '#fdecec',
  amber: '#9a650e',
  amberSoft: '#fff3dd',
  okSoft: '#e9f8f3',
  info: '#1d4fa8',
  infoSoft: '#e6eefc',
};

export const fonts = {
  display: 'AtkinsonHyperlegible_700Bold',
  displayRegular: 'AtkinsonHyperlegible_400Regular',
  body: 'Sora_400Regular',
  medium: 'Sora_500Medium',
  semibold: 'Sora_600SemiBold',
  bold: 'Sora_700Bold',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20 };

export type Tone = 'ok' | 'wait' | 'bad' | 'gray' | 'info';

export const toneColors: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: colors.okSoft, fg: '#08755f' },
  wait: { bg: colors.amberSoft, fg: colors.amber },
  bad: { bg: colors.dangerSoft, fg: colors.danger },
  gray: { bg: '#edf1f2', fg: '#4c5d64' },
  info: { bg: colors.infoSoft, fg: colors.info },
};
