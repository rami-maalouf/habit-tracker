import { act } from '@testing-library/react-native';

import * as commands from '@/core/domain/commands';
import { getAppSettings } from '@/core/domain/queries';
import * as icons from '@/platform/alternate-icons';

import { getProductCore, resetProductCoreForTests } from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('@/platform/alternate-icons', () => ({
  supportsAlternateIcons: jest.fn(async () => true),
  setAlternateIcon: jest.fn(async () => undefined),
}));

const supported = jest.mocked(icons.supportsAlternateIcons);
const switchIcon = jest.mocked(icons.setAlternateIcon);

async function selectedIcon() {
  const core = await getProductCore();
  if (!core.ok) throw new Error('core failed');
  const settings = await getAppSettings(core.value);
  if (!settings.ok || !settings.value) throw new Error('settings failed');
  return settings.value.selectedIcon;
}

async function openIcons() {
  renderRouter('src/app', { initialUrl: '/settings/icons' });
  await settle();
}

describe('alternate app icon selection', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    supported.mockReset().mockResolvedValue(true);
    switchIcon.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps selection disabled when the platform has no registered alternate icons', async () => {
    supported.mockResolvedValue(false);
    await openIcons();
    expect(screen.getByRole('button', { name: 'Use Midnight icon' })).toBeDisabled();
    expect(await selectedIcon()).toBe('default');
    expect(switchIcon).not.toHaveBeenCalled();
  });

  it('persists only after platform confirmation, prevents double submission, and restores default with null', async () => {
    let confirm!: () => void;
    switchIcon.mockImplementationOnce(() => new Promise<void>((resolve) => { confirm = resolve; }));
    await openIcons();
    const midnight = screen.getByRole('button', { name: 'Use Midnight icon' });
    fireEvent.press(midnight);
    fireEvent.press(midnight);
    await settle();
    expect(switchIcon).toHaveBeenCalledTimes(1);
    expect(await selectedIcon()).toBe('default');
    expect(midnight).toBeDisabled();
    await act(async () => confirm());
    await settle();
    expect(await selectedIcon()).toBe('midnight');
    expect(screen.getByRole('button', { name: 'Use Midnight icon', selected: true })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Use Default icon' }));
    await settle();
    expect(switchIcon).toHaveBeenLastCalledWith(null);
    expect(await selectedIcon()).toBe('default');
  });

  it('retains the previous selection after a platform failure and retries without exposing native details', async () => {
    switchIcon.mockRejectedValueOnce(new Error('private native details'));
    await openIcons();
    fireEvent.press(screen.getByRole('button', { name: 'Use Paper icon' }));
    await settle();
    expect(await selectedIcon()).toBe('default');
    expect(screen.queryByText(/private native/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Use Default icon', selected: true })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Retry icon change' }));
    await settle();
    expect(await selectedIcon()).toBe('paper');
  });

  it.each([false, true])('compensates a failed settings write and offers a retry (rollback fails: %s)', async (rollbackFails) => {
    const save = jest.spyOn(commands, 'setSelectedIcon').mockResolvedValueOnce({
      ok: false, error: { code: 'database', message: 'injected storage failure', retryable: true },
    });
    switchIcon.mockResolvedValueOnce(undefined);
    if (rollbackFails) switchIcon.mockRejectedValueOnce(new Error('private rollback detail'));
    await openIcons();
    fireEvent.press(screen.getByRole('button', { name: 'Use Midnight icon' }));
    await settle();
    expect(switchIcon).toHaveBeenNthCalledWith(2, null);
    expect(await selectedIcon()).toBe('default');
    expect(screen.queryByText(/private rollback/)).toBeNull();
    save.mockRestore();
    fireEvent.press(screen.getByRole('button', { name: 'Retry icon change' }));
    await settle();
    expect(await selectedIcon()).toBe('midnight');
  });

  it('recovers a failed availability check', async () => {
    supported.mockRejectedValueOnce(new Error('private native detail'));
    await openIcons();
    expect(screen.queryByText(/private native/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry app icons' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Use Paper icon' })).toBeEnabled();
  });
});
