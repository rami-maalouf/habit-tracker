import type { AdaptiveMaterialProps, MaterialKind } from './material-geometry';
import { getOpaqueMaterialKind, OpaqueMaterial } from './adaptive-material-opaque';

// android boundary: opaque semantic surface until the android-readiness
// module introduces compose-native materials
export function getMaterialKind(_forceFallback: boolean): MaterialKind {
  return getOpaqueMaterialKind();
}

export function AdaptiveMaterial(props: AdaptiveMaterialProps) {
  return <OpaqueMaterial {...props} />;
}
