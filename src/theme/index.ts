// the only public theme entry point: feature code imports from '@/theme'
export {
  brand,
  brandColor,
  normalizeScheme,
  resolveSemanticPalette,
  semanticColor,
  semanticFallbacks,
  semanticRoles,
} from './colors';
export type { BrandRole, ColorScheme, SemanticRole } from './colors';
export { spacing } from './spacing';
export type { SpacingToken } from './spacing';
export { lineHeightFor, typography } from './typography';
export type { TypographyVariant } from './typography';
export { radius, radiusCurve } from './radius';
export type { RadiusToken } from './radius';
export { shadows } from './shadows';
export type { ShadowToken } from './shadows';
export { durations, resolveDuration, resolveSpring, springs } from './motion';
export type { DurationToken, SpringToken } from './motion';
