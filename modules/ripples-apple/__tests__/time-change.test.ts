import { requireOptionalNativeModule } from 'expo';

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(),
}));

describe('significant time change adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards significant time changes and removes the native subscription', () => {
    const listeners = new Set<() => void>();
    const remove = jest.fn();
    const addListener = jest.fn((_event: string, listener: () => void) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
          remove();
        },
      };
    });
    jest.mocked(requireOptionalNativeModule).mockReturnValue({ addListener });

    jest.isolateModules(() => {
      const { addSignificantTimeChangeListener } = jest.requireActual<
        typeof import('../../../src/platform/time-change/index.ios')
      >('../../../src/platform/time-change/index.ios');
      const listener = jest.fn();
      const unsubscribe = addSignificantTimeChangeListener(listener);

      expect(requireOptionalNativeModule).toHaveBeenCalledWith('RipplesApple');
      expect(addListener).toHaveBeenCalledWith('onSignificantTimeChange', listener);
      listeners.forEach((callback) => callback());
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      listeners.forEach((callback) => callback());
      expect(listener).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  it('remains usable in an older ios binary that lacks the local module', () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);

    jest.isolateModules(() => {
      const { addSignificantTimeChangeListener } = jest.requireActual<
        typeof import('../../../src/platform/time-change/index.ios')
      >('../../../src/platform/time-change/index.ios');
      const listener = jest.fn();
      const unsubscribe = addSignificantTimeChangeListener(listener);

      expect(unsubscribe).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it('does not load apple native code on unsupported platforms', () => {
    const { addSignificantTimeChangeListener } = jest.requireActual<
      typeof import('../../../src/platform/time-change/index')
    >('../../../src/platform/time-change/index.ts');
    const listener = jest.fn();
    const unsubscribe = addSignificantTimeChangeListener(listener);

    expect(unsubscribe).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  });
});
