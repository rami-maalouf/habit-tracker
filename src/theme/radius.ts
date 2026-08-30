// named radius tokens, ascending; capsule is reserved for pill shapes
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  capsule: 999,
} as const;

export type RadiusToken = keyof typeof radius;

// non-capsule rounded shapes always pair a radius token with this curve
export const radiusCurve = 'continuous' as const;
