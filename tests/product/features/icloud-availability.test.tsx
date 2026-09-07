import * as sync from '@/platform/sync';

import { resetProductCoreForTests } from '../../../src/testing/product-core.mock';
import { renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('@/platform/sync', () => ({
  ...jest.requireActual('@/platform/sync'),
  cloudKitAvailable: jest.fn(async () => false),
}));

describe('runtime icloud availability', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    jest.mocked(sync.cloudKitAvailable).mockReset();
  });

  it('hides the unavailable message when the native account check succeeds', async () => {
    jest.mocked(sync.cloudKitAvailable).mockResolvedValue(true);
    renderRouter('src/app', { initialUrl: '/settings/sync' });
    await settle();
    expect(sync.cloudKitAvailable).toHaveBeenCalled();
    expect(screen.queryByTestId('icloud-unavailable')).toBeNull();
  });

  it.each([false, 'reject'])('explains unavailable icloud without exposing account details (%s)', async (outcome) => {
    if (outcome === 'reject') {
      jest.mocked(sync.cloudKitAvailable).mockRejectedValue(new Error('private account details'));
    } else {
      jest.mocked(sync.cloudKitAvailable).mockResolvedValue(false);
    }
    renderRouter('src/app', { initialUrl: '/settings/sync' });
    await settle();
    expect(screen.getByTestId('icloud-unavailable')).toHaveTextContent(/changes stay queued/);
    expect(screen.queryByText(/private account details/)).toBeNull();
  });
});
