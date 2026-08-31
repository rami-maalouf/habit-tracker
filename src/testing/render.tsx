import type { ReactElement } from 'react';
import type { RenderResult } from '@testing-library/react-native';
import { act, configure, render } from '@testing-library/react-native';

// the jest screen-stack mock leaves background screens aria-hidden after a
// sheet dismisses, so queries include hidden elements; on-device visibility
// is argent's concern, not the navigator mock's
configure({ defaultIncludeHiddenElements: true });

// router-aware rendering and the shared screen come from expo-router's
// testing library; plain component rendering from rntl (same module instance)
export { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// renderRouter runs under fake timers; async command -> invalidate -> requery
// chains need explicit act flushes between macro- and microtasks.
// timer advancement gets its own awaited act: a timer that starts async work
// (a retry, a refresh) would otherwise open a nested act scope inside this
// one and react warns about the interleaving.
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(60);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

export function renderComponent(ui: ReactElement): RenderResult {
  return render(ui);
}
