import type { ReactElement } from 'react';
import type { RenderResult } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';

// router-aware rendering and the shared screen come from expo-router's
// testing library; plain component rendering from rntl (same module instance)
export { renderRouter, screen } from 'expo-router/testing-library';

export function renderComponent(ui: ReactElement): RenderResult {
  return render(ui);
}
