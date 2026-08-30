// named motion tokens; decorative motion collapses under reduce motion
export const durations = {
  instant: 0,
  fast: 150,
  standard: 250,
  slow: 400,
} as const;

export type DurationToken = keyof typeof durations;

export const springs = {
  snappy: { damping: 20, stiffness: 300, mass: 1 },
  gentle: { damping: 26, stiffness: 170, mass: 1 },
} as const;

export type SpringToken = keyof typeof springs;

export function resolveDuration(prefersReducedMotion: boolean, token: DurationToken): number {
  return prefersReducedMotion ? 0 : durations[token];
}

// undefined means: apply the end state immediately, with no spring animation
export function resolveSpring(
  prefersReducedMotion: boolean,
  token: SpringToken,
): (typeof springs)[SpringToken] | undefined {
  return prefersReducedMotion ? undefined : springs[token];
}
