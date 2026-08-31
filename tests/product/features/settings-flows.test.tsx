import { Alert } from 'react-native';

import { createBoard } from '@/core/domain/commands';
import { listActiveBoards } from '@/core/domain/queries';
import { parseOwnExport } from '@/core/export/import-parsers';

import {
  dataTransferMock,
  resetDataTransferMock,
} from '../../../src/testing/data-transfer.mock';
import { notificationsMock } from '../../../src/testing/expo-notifications.mock';
import {
  getProductCore,
  newCommandId,
  resetProductCoreForTests,
} from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

const RIPPLES_CSV = `entity,board_id,board_name,board_amountKind,board_tracksCheckinTime,board_tracksPerformanceMetrics,board_defaultAmount,board_dayStartShiftSeconds,board_archivedAt,board_createdAt,checkin_id,checkin_boardId,checkin_amount,checkin_note,checkin_createdAt
Board,0C137BDE-BCB0-465B-8C9B-BE3E71774FA6,"imported habit",,false,true,,0.0,,2026-05-04T02:06:28Z,,,,,
Checkin,,,,,,,,,,D5EC18C1-F13A-4594-A4F5-9450BC6D6004,0C137BDE-BCB0-465B-8C9B-BE3E71774FA6,,,2026-05-04T15:17:39Z
Checkin,,,,,,,,,,3088B55B-6C39-4B43-B948-ABE97EFFFA53,0C137BDE-BCB0-465B-8C9B-BE3E71774FA6,,,2026-08-23T03:29:26Z
`;

describe('settings sheet', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    resetDataTransferMock();
    alertSpy.mockClear();
  });

  it('renders every reference group with the version detail', async () => {
    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-notifications');
    for (const id of [
      'settings-feedback',
      'settings-rate',
      'settings-more-products',
      'settings-icloud',
      'open-archived-boards',
      'settings-import',
      'settings-export',
      'settings-app-icon',
      'settings-timeline',
      'settings-privacy',
      'settings-terms',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('settings-version')).toHaveTextContent(/test \(test\)/);
  });

  it('shows the explicit missing-release-link state', async () => {
    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-feedback');
    await press('settings-feedback');
    expect(screen.getByTestId('settings-link-notice')).toHaveTextContent(
      'Missing release link for Request feature or report issue.',
    );
  });

  it('exports a shareable snapshot after the privacy confirmation', async () => {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const created = await createBoard(opened.value, {
      commandId: newCommandId(),
      title: 'to export',
      symbol: 'star.fill',
      accentHex: '#78D98B',
      usesTintedBackground: true,
      tracksAmount: false,
      amountUnit: null,
      quickAmount: 1,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    expect(created.ok).toBe(true);

    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-export');

    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Export')?.onPress?.();
    });
    await press('settings-export');
    await settle();

    expect(alertSpy).toHaveBeenCalledWith(
      'Export Data',
      expect.stringContaining('private notes'),
      expect.any(Array),
    );
    expect(dataTransferMock.sharedFiles).toHaveLength(1);
    const shared = dataTransferMock.sharedFiles[0];
    expect(shared.fileName).toMatch(/^ripples-export-.*Z\.json$/);
    // the shared bytes are a valid own-format export
    const parsed = parseOwnExport(shared.contents);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    expect(parsed.value.boards).toHaveLength(1);
    expect(parsed.value.boards[0].title).toBe('to export');
  });

  it('surfaces a failed share without losing the sheet', async () => {
    dataTransferMock.shareOutcome = 'error';
    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('settings-export');
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Export')?.onPress?.();
    });
    await press('settings-export');
    await settle();
    expect(await screen.findByTestId('settings-export-error')).toBeOnTheScreen();
  });
});

describe('import flow', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    resetDataTransferMock();
    alertSpy.mockClear();
  });

  it('imports a ripples csv through preview and summary', async () => {
    dataTransferMock.nextPick = { name: 'ripples.csv', contents: RIPPLES_CSV };
    renderRouter('src/app', { initialUrl: '/settings/import' });
    await screen.findByTestId('import-ripples');
    await press('import-ripples');

    expect(await screen.findByTestId('import-preview')).toBeOnTheScreen();
    expect(screen.getByTestId('import-preview-counts')).toHaveTextContent(
      '1 board, 2 check-ins.',
    );
    await press('import-confirm');
    await settle();

    expect(await screen.findByTestId('import-done')).toBeOnTheScreen();
    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      'Added 1 board and 2 check-ins.',
    );

    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const boards = await listActiveBoards(opened.value);
    expect(boards.ok && boards.value[0].title).toBe('imported habit');
  });

  it('keeps the chooser when the picker is cancelled', async () => {
    dataTransferMock.nextPick = 'cancel';
    renderRouter('src/app', { initialUrl: '/settings/import' });
    await screen.findByTestId('import-ripples');
    await press('import-ripples');
    expect(screen.getByTestId('import-ripples')).toBeOnTheScreen();
    expect(screen.queryByTestId('import-error')).toBeNull();
  });

  it('explains an unreadable or foreign file', async () => {
    dataTransferMock.nextPick = { name: 'junk.csv', contents: 'a,b,c\n1,2,3' };
    renderRouter('src/app', { initialUrl: '/settings/import' });
    await screen.findByTestId('import-ripples');
    await press('import-ripples');
    expect(await screen.findByTestId('import-error')).toHaveTextContent(
      'This file does not look like a Ripples CSV export.',
    );

    dataTransferMock.nextPick = 'error';
    await press('import-ripples');
    expect(await screen.findByTestId('import-error')).toHaveTextContent(
      'The file could not be read.',
    );
  });

  it('restores this app\'s own export and skips existing records', async () => {
    const ownJson = JSON.stringify({
      format: 'ripples.export',
      exportVersion: 1,
      boards: [
        {
          id: '00000000-0000-4000-8000-0000000000aa',
          title: 'restored board',
          symbol: 'star.fill',
          accentHex: '#78D98B',
          usesTintedBackground: true,
          tracksAmount: false,
          amountUnit: null,
          quickAmount: 1,
          tracksTime: false,
          startOfDayMinute: 0,
          metricsEnabled: true,
          orderKey: 'a0',
          createdAtUtc: Date.UTC(2026, 6, 1),
          archivedAtUtc: null,
          periods: [{ startDate: '2026-07-01', endDate: null }],
        },
      ],
      checkIns: [
        {
          id: '00000000-0000-4000-8000-0000000000bb',
          boardId: '00000000-0000-4000-8000-0000000000aa',
          logicalDate: '2026-07-02',
          occurredAtUtc: null,
          timeZoneId: null,
          offsetMinutes: null,
          amount: null,
          note: 'restored note',
          source: 'app',
          createdAtUtc: Date.UTC(2026, 6, 2),
        },
      ],
    });
    dataTransferMock.nextPick = { name: 'backup.json', contents: ownJson };
    renderRouter('src/app', { initialUrl: '/settings/import' });
    await screen.findByTestId('import-own');
    await press('import-own');
    await press('import-confirm');
    await settle();
    expect(await screen.findByTestId('import-summary')).toHaveTextContent(
      'Added 1 board and 1 check-in.',
    );

    // restoring the same file again skips everything
    await press('import-again');
    dataTransferMock.nextPick = { name: 'backup.json', contents: ownJson };
    await press('import-own');
    await press('import-confirm');
    await settle();
    expect(await screen.findByTestId('import-summary')).toHaveTextContent(/Skipped 1 board and 1 check-in that already existed/);
  });
});

describe('release link validation', () => {
  it('returns https links, rejects other schemes, and passes null through', () => {
    const { releaseLink } = jest.requireActual<
      typeof import('../../../src/features/settings/release-links')
    >('../../../src/features/settings/release-links');
    const links = {
      feedback: 'https://example.com/feedback',
      appStoreReview: 'http://example.com/insecure',
      moreProducts: null,
      privacyPolicy: null,
      termsOfUse: null,
    };
    expect(releaseLink('feedback', links)).toBe('https://example.com/feedback');
    expect(releaseLink('appStoreReview', links)).toBeNull();
    expect(releaseLink('moreProducts', links)).toBeNull();
  });
});

describe('notifications, icloud, icon, and timeline surfaces', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    notificationsMock.granted = false;
    notificationsMock.canAskAgain = true;
  });

  it('reports the current notification authorization', async () => {
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    expect(await screen.findByTestId('notifications-status')).toHaveTextContent(/Not requested yet/);
    expect(screen.queryByTestId('notifications-open-settings')).toBeNull();
  });

  it('offers open settings when permission is denied', async () => {
    notificationsMock.granted = false;
    notificationsMock.canAskAgain = false;
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    expect(await screen.findByTestId('notifications-status')).toHaveTextContent(/Denied/);
    expect(screen.getByTestId('notifications-open-settings')).toBeOnTheScreen();
  });

  it('shows allowed when permission is granted', async () => {
    notificationsMock.granted = true;
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    expect(await screen.findByTestId('notifications-status')).toHaveTextContent(/Allowed/);
  });

  it('treats a failed permission read as not requested', async () => {
    notificationsMock.reject = true;
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    expect(await screen.findByTestId('notifications-status')).toHaveTextContent(
      /Not requested yet/,
    );
    notificationsMock.reject = false;
  });

  it('renders the explicit icloud, icon, and timeline states', async () => {
    renderRouter('src/app', { initialUrl: '/settings/icloud' });
    expect(await screen.findByTestId('icloud-interim')).toBeOnTheScreen();

    renderRouter('src/app', { initialUrl: '/settings/app-icon' });
    expect(await screen.findByTestId('app-icon-interim')).toBeOnTheScreen();
    expect(screen.getByTestId('icon-preview-midnight')).toBeOnTheScreen();

    renderRouter('src/app', { initialUrl: '/settings/timeline' });
    expect(await screen.findByText('In development')).toBeOnTheScreen();
  });
});
