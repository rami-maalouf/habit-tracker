export type HeatmapIntensity = 'empty' | 'low' | 'medium' | 'high';

// intensity represents check-in count, never amount
export function heatmapIntensity(checkInCount: number): HeatmapIntensity {
  if (checkInCount <= 0) {
    return 'empty';
  }
  if (checkInCount === 1) {
    return 'low';
  }
  if (checkInCount === 2) {
    return 'medium';
  }
  return 'high';
}
