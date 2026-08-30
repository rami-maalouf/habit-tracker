import type { AdaptiveMaterialProps, MaterialKind } from './material-geometry';
import { getOpaqueMaterialKind, OpaqueMaterial } from './adaptive-material-opaque';

// web-safe boundary: no native material capability, always the opaque surface
export function getMaterialKind(_forceFallback: boolean): MaterialKind {
  return getOpaqueMaterialKind();
}

export function AdaptiveMaterial(props: AdaptiveMaterialProps) {
  return <OpaqueMaterial {...props} />;
}
