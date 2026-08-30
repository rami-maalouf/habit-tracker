// deterministic local fixtures for the foundation preview: no clocks, no
// network, no downstream feature state
export const typographySampleText =
  'Ripples keeps every habit visible with calm, wrapping sample text that spans more than one line.';

export const frequencyOptions = ['Daily', 'Weekly', 'Monthly'] as const;

export const previewDefaults = {
  habitEnabled: true,
  intensity: 0.5,
  frequency: 'Daily',
  actionCount: 0,
} as const;
