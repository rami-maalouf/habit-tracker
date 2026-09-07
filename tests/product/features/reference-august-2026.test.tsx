import { listActiveBoards } from '@/core/domain/queries';

import {
  getProductCore,
  mockClock,
  resetProductCoreForTests,
} from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

describe('august 2026 reference fixture route', () => {
  beforeEach(() => {
    resetProductCoreForTests();
  });

  it('requires an explicit development action and then opens the populated home', async () => {
    const originalNow = mockClock.utcMs;
    renderRouter('src/app', { initialUrl: '/reference-august-2026' });

    expect(await screen.findByTestId('reference-seed-action')).toBeOnTheScreen();
    const core = await getProductCore();
    expect(core.ok).toBe(true);
    if (!core.ok) return;
    const before = await listActiveBoards(core.value);
    expect(before.ok && before.value).toHaveLength(0);

    fireEvent.press(screen.getByTestId('reference-seed-action'));
    await settle();
    await settle();

    expect(screen).toHavePathname('/');
    expect(await screen.findByText('plan your day')).toBeOnTheScreen();
    expect(screen.getByText('don’t touch stash, ever')).toBeOnTheScreen();
    expect(mockClock.utcMs).toBe(originalNow);
  });

  it('redirects without exposing the action in production mode', async () => {
    const devFlag = global as unknown as { __DEV__: boolean };
    const original = devFlag.__DEV__;
    devFlag.__DEV__ = false;
    try {
      renderRouter('src/app', { initialUrl: '/reference-august-2026' });
      await screen.findByTestId('empty-create-board');
      expect(screen.queryByTestId('reference-seed-action')).toBeNull();
      expect(screen).toHavePathname('/');
    } finally {
      devFlag.__DEV__ = original;
    }
  });
});
