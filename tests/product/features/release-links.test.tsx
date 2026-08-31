import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { resetProductCoreForTests } from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// a release build carries real links; the module is replaced so the routing
// between the in-app browser and the system opener can be proven
jest.mock('../../../src/features/settings/release-links', () => ({
  releaseLink: (key: string) =>
    key === 'appStoreReview'
      ? 'https://apps.apple.com/app/id0000000000?action=write-review'
      : `https://example.com/${key}`,
}));

const browserSpy = jest
  .spyOn(WebBrowser, 'openBrowserAsync')
  .mockResolvedValue({ type: 'dismiss' } as never);
const linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

describe('release link destinations', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    browserSpy.mockClear();
    linkingSpy.mockClear();
  });

  it('opens support and legal destinations in the in-app browser', async () => {
    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-privacy');
    await press('settings-privacy');
    expect(browserSpy).toHaveBeenCalledWith('https://example.com/privacyPolicy');
    await press('settings-terms');
    expect(browserSpy).toHaveBeenCalledWith('https://example.com/termsOfUse');
    await press('settings-feedback');
    expect(browserSpy).toHaveBeenCalledWith('https://example.com/feedback');
    expect(linkingSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('settings-link-notice')).toBeNull();
  });

  it('hands the app store review link to the system opener', async () => {
    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-rate');
    await press('settings-rate');
    expect(linkingSpy).toHaveBeenCalledWith(
      'https://apps.apple.com/app/id0000000000?action=write-review',
    );
    expect(browserSpy).not.toHaveBeenCalled();
  });

  it('reports a destination that will not open', async () => {
    browserSpy.mockRejectedValueOnce(new Error('no browser'));
    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-privacy');
    await press('settings-privacy');
    expect(await screen.findByTestId('settings-link-notice')).toHaveTextContent(
      /Privacy Policy could not be opened/,
    );
  });
});
