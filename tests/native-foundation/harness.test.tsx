import { Text } from 'react-native';

import { renderComponent, renderRouter, screen } from '../../src/testing/render';

describe('test harness', () => {
  it('renders a react native component and queries by text', () => {
    renderComponent(<Text>harness ready</Text>);

    expect(screen.getByText('harness ready')).toBeOnTheScreen();
  });

  it('renders a mocked router tree and resolves the initial url', () => {
    renderRouter({ index: () => <Text>root</Text> }, { initialUrl: '/' });

    expect(screen).toHavePathname('/');
  });
});
