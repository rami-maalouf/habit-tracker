import { resetProductCoreForTests } from '../../src/testing/product-core.mock';

import { fireEvent, renderRouter, screen } from '../../src/testing/render';

describe('root routes', () => {
  beforeEach(() => {
    resetProductCoreForTests();
  });

  it('resolves / with the boards home', async () => {
    renderRouter('src/app', { initialUrl: '/' });

    expect(screen).toHavePathname('/');
    // the native-stack header renders natively, not as a text node under jest
    // mocks, so the title is asserted through the header config; the rendered
    // header itself is simulator evidence (argent), per the spec's split
    await screen.findByTestId('empty-create-board');
    expect(screen.UNSAFE_getByProps({ title: 'Boards' })).toBeTruthy();
  });

  it('recovers from an unmatched route back to / through +not-found', async () => {
    renderRouter('src/app', { initialUrl: '/this-route-does-not-exist' });

    expect(await screen.findByText('This screen does not exist.')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Go to the home screen'));

    expect(screen).toHavePathname('/');
    await screen.findByTestId('empty-create-board');
  });
});
