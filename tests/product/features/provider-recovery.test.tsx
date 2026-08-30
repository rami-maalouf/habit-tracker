import { Text } from 'react-native';

import { err } from '@/core/domain/result';
import type { ProductCore } from '@/platform/database/product-core';

import * as coreModule from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle, renderComponent } from '../../../src/testing/render';
import {
  ProductProvider,
  useProduct,
  useProductQuery,
} from '../../../src/features/product-store';

describe('product provider recovery', () => {
  beforeEach(() => {
    coreModule.resetProductCoreForTests();
    jest.restoreAllMocks();
  });

  it('shows the recovery surface on a failed open and retries into the app', async () => {
    jest
      .spyOn(coreModule, 'getProductCore')
      .mockResolvedValueOnce(err('database', 'The database file is locked.', { retryable: true }));

    renderRouter('src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('product-recovery')).toBeOnTheScreen();
    expect(screen.getByText('The database file is locked.')).toBeOnTheScreen();

    // the retry falls through to the real in-memory open
    fireEvent.press(screen.getByText('Try again'));
    await settle();
    expect(await screen.findByTestId('empty-create-board')).toBeOnTheScreen();
  });

  it('maps a rejected open to the recovery surface', async () => {
    jest
      .spyOn(coreModule, 'getProductCore')
      .mockRejectedValueOnce(new Error('unexpected open failure'));

    renderRouter('src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('product-recovery')).toBeOnTheScreen();
    expect(screen.getByText('unexpected open failure')).toBeOnTheScreen();
  });

  it('stringifies a non-error open rejection', async () => {
    jest.spyOn(coreModule, 'getProductCore').mockRejectedValueOnce('disk detached');

    renderRouter('src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('product-recovery')).toBeOnTheScreen();
    expect(screen.getByText('disk detached')).toBeOnTheScreen();
  });

  it('useProduct throws outside a provider', () => {
    function Bare() {
      useProduct();
      return <Text>never</Text>;
    }
    expect(() => renderComponent(<Bare />)).toThrow('useProduct requires a ProductProvider');
  });

  it('maps a rejected query to an error state under a core override', async () => {
    const opened = await coreModule.getProductCore();
    if (!opened.ok) {
      throw new Error('test core failed to open');
    }

    function Probe() {
      const query = useProductQuery<never>(() => Promise.reject('query blew up'), []);
      return <Text>{query.status === 'error' ? query.error.message : 'pending'}</Text>;
    }

    renderComponent(
      <ProductProvider coreOverride={opened.value as unknown as ProductCore}>
        <Probe />
      </ProductProvider>,
    );
    await settle();
    expect(screen.getByText('query blew up')).toBeOnTheScreen();
  });
});
