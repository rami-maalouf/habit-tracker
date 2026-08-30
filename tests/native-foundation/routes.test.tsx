import { fireEvent, renderRouter, screen } from '../../src/testing/render';

describe('root routes', () => {
  it('resolves / with the ripples title and selectable ready text', () => {
    renderRouter('src/app', { initialUrl: '/' });

    expect(screen).toHavePathname('/');
    // the native-stack header renders natively, not as a text node under jest
    // mocks, so the title is asserted through the header config; the rendered
    // header itself is simulator evidence (argent), per the spec's split
    expect(screen.UNSAFE_getByProps({ title: 'Ripples' })).toBeTruthy();
    const body = screen.getByText('Native foundation ready');
    expect(body).toBeOnTheScreen();
    expect(body.props.selectable).toBe(true);
    // the scroll surface must use automatic inset adjustment (spec root-route
    // contract); asserted by prop for the same jest-mock reason as the title
    expect(
      screen.UNSAFE_getByProps({ contentInsetAdjustmentBehavior: 'automatic' }),
    ).toBeTruthy();
  });

  it('recovers from an unmatched route back to / through +not-found', () => {
    renderRouter('src/app', { initialUrl: '/this-route-does-not-exist' });

    expect(screen.getByText('This screen does not exist.')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Go to the home screen'));

    expect(screen).toHavePathname('/');
    expect(screen.getByText('Native foundation ready')).toBeOnTheScreen();
  });
});
