// box-shadow strings only; legacy platform shadow props are banned
export const shadows = {
  card: '0 2px 8px rgba(0, 0, 0, 0.12)',
  raised: '0 4px 16px rgba(0, 0, 0, 0.18)',
  overlay: '0 8px 32px rgba(0, 0, 0, 0.28)',
} as const;

export type ShadowToken = keyof typeof shadows;
