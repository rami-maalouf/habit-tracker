import { requireOptionalNativeModule } from 'expo';

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(),
}));

type Adapter = typeof import('../../../src/platform/alternate-icons/index.ios');

function loadAdapter(nativeModule: object | null): Adapter {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(nativeModule);
  let adapter: Adapter;
  jest.isolateModules(() => {
    adapter = jest.requireActual<Adapter>('../../../src/platform/alternate-icons/index.ios');
  });
  return adapter!;
}

describe('alternate app icon adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports support only when the native icon adapter is available and allows changes', async () => {
    const native = {
      supportsAlternateIcons: jest.fn().mockResolvedValue(true),
      setAlternateIcon: jest.fn(),
    };
    const adapter = loadAdapter(native);

    await expect(adapter.supportsAlternateIcons()).resolves.toBe(true);
    expect(requireOptionalNativeModule).toHaveBeenCalledWith('RipplesApple');
    native.supportsAlternateIcons.mockResolvedValue(false);
    await expect(adapter.supportsAlternateIcons()).resolves.toBe(false);
  });

  it.each([null, {}, { supportsAlternateIcons: jest.fn().mockResolvedValue(true) }])(
    'fails closed for an older or missing native implementation: %p',
    async (nativeModule) => {
      const adapter = loadAdapter(nativeModule);

      await expect(adapter.supportsAlternateIcons()).resolves.toBe(false);
      await expect(adapter.setAlternateIcon('midnight')).rejects.toThrow(
        'Alternate app icons are unavailable on this device.',
      );
    },
  );

  it('fails closed when the native support check fails', async () => {
    const native = {
      supportsAlternateIcons: jest.fn().mockRejectedValue(new Error('private native detail')),
      setAlternateIcon: jest.fn(),
    };
    const adapter = loadAdapter(native);

    await expect(adapter.supportsAlternateIcons()).resolves.toBe(false);
    await expect(adapter.setAlternateIcon('paper')).rejects.toThrow(
      'Alternate app icons are unavailable on this device.',
    );
    expect(native.setAlternateIcon).not.toHaveBeenCalled();
  });

  it.each(['midnight', 'paper', null] as const)(
    'waits for platform confirmation before resolving %s',
    async (icon) => {
      let confirm: () => void = () => {};
      const native = {
        supportsAlternateIcons: jest.fn().mockResolvedValue(true),
        setAlternateIcon: jest.fn(() => new Promise<void>((resolve) => { confirm = resolve; })),
      };
      const adapter = loadAdapter(native);
      const completed = jest.fn();
      const result = adapter.setAlternateIcon(icon).then(completed);
      await Promise.resolve();
      await Promise.resolve();

      expect(native.setAlternateIcon).toHaveBeenCalledWith(icon);
      expect(completed).not.toHaveBeenCalled();
      confirm();
      await result;
      expect(completed).toHaveBeenCalledTimes(1);
    },
  );

  it('replaces native failure details with a fixed retryable message', async () => {
    const native = {
      supportsAlternateIcons: jest.fn().mockResolvedValue(true),
      setAlternateIcon: jest.fn().mockRejectedValue(new Error('private native detail')),
    };
    const adapter = loadAdapter(native);

    await expect(adapter.setAlternateIcon('paper')).rejects.toThrow(
      'The app icon could not be changed. Try again.',
    );
  });

  it('reports unsupported without loading apple code on generic platforms', async () => {
    const adapter = jest.requireActual<Adapter>('../../../src/platform/alternate-icons/index.ts');

    await expect(adapter.supportsAlternateIcons()).resolves.toBe(false);
    await expect(adapter.setAlternateIcon(null)).rejects.toThrow(
      'Alternate app icons are unavailable on this device.',
    );
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  });
});
