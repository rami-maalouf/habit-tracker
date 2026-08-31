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
import { act } from '@testing-library/react-native';

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
    // the notice must render above the scroll content, or a tap near the
    // top of a long settings list appears to do nothing
    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered.indexOf('settings-link-notice')).toBeGreaterThan(-1);
    expect(rendered.indexOf('settings-link-notice')).toBeLessThan(
      rendered.indexOf('settings-notifications'),
    );
  });

  it('exports a shareable snapshot from the export destination', async () => {
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
    await press('settings-export');

    // the destination itself warns about private notes before sharing
    expect(await screen.findByTestId('export-start')).toBeOnTheScreen();
    expect(screen.getByText(/contains your private notes/)).toBeOnTheScreen();
    await press('export-start');
    await settle();

    expect(await screen.findByTestId('export-shared')).toBeOnTheScreen();
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

  it('surfaces a failed share on the export destination', async () => {
    dataTransferMock.shareOutcome = 'error';
    renderRouter('src/app', { initialUrl: '/settings/export' });
    await screen.findByTestId('export-start');
    await press('export-start');
    await settle();
    expect(await screen.findByTestId('export-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('export-shared')).toBeNull();
  });

  it('surfaces a failed snapshot before any share happens', async () => {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    await opened.value.db.closeAsync();
    renderRouter('src/app', { initialUrl: '/settings/export' });
    await screen.findByTestId('export-start');
    await press('export-start');
    await settle();
    expect(await screen.findByTestId('export-error')).toBeOnTheScreen();
    expect(dataTransferMock.sharedFiles).toHaveLength(0);
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

  it('renders the explicit icon and timeline states', async () => {
    renderRouter('src/app', { initialUrl: '/settings/icons' });
    expect(await screen.findByTestId('app-icon-interim')).toBeOnTheScreen();
    expect(screen.getByTestId('icon-preview-midnight')).toBeOnTheScreen();

    renderRouter('src/app', { initialUrl: '/settings/timeline' });
    expect(await screen.findByText('In development')).toBeOnTheScreen();
  });
});

describe('icloud sync settings', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('explains where the data goes before turning sync on', async () => {
    renderRouter('src/app', { initialUrl: '/settings/sync' });
    await screen.findByTestId('icloud-toggle');
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Off/);
    // the transport is unavailable in this build and says so
    expect(screen.getByTestId('icloud-unavailable')).toHaveTextContent(
      /Apple Developer team/,
    );

    // cancelling the explanation leaves sync off
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'cancel')?.onPress?.();
    });
    fireEvent(screen.getByTestId('icloud-toggle'), 'valueChange', true);
    await settle();
    expect(alertSpy).toHaveBeenCalledWith(
      'Turn on iCloud Sync?',
      expect.stringContaining('your own private iCloud account'),
      expect.anything(),
    );
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Off/);
  });

  it('reports needs attention when the unavailable transport is used', async () => {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const created = await createBoard(opened.value, {
      commandId: newCommandId(),
      title: 'queued board',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    renderRouter('src/app', { initialUrl: '/settings/sync' });
    await screen.findByTestId('icloud-toggle');
    // the outbox depth is visible before any sync runs
    expect(screen.getByTestId('icloud-pending')).toHaveTextContent(/[1-9]/);
    expect(screen.getByTestId('icloud-last-sync')).toHaveTextContent(/Never/);

    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Turn On')?.onPress?.();
    });
    fireEvent(screen.getByTestId('icloud-toggle'), 'valueChange', true);
    await settle();
    await settle();
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Needs Attention/);
    // every local change is still queued, nothing was lost
    expect(screen.getByTestId('icloud-pending')).toHaveTextContent(/[1-9]/);

    // an enabled sync exposes a manual Sync Now that reports the same state
    await press('icloud-sync-now');
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Needs Attention/);

    // turning it back off needs no confirmation and reports off
    fireEvent(screen.getByTestId('icloud-toggle'), 'valueChange', false);
    await settle();
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Off/);
    expect(screen.queryByTestId('icloud-sync-now')).toBeNull();
  });

  it('retries a failed pass on the engine backoff and stops when turned off', async () => {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const created = await createBoard(opened.value, {
      commandId: newCommandId(),
      title: 'retry board',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    renderRouter('src/app', { initialUrl: '/settings/sync' });
    await screen.findByTestId('icloud-toggle');
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Turn On')?.onPress?.();
    });
    fireEvent(screen.getByTestId('icloud-toggle'), 'valueChange', true);
    await settle();
    await settle();
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Needs Attention/);

    // the engine asked for a retry; advancing past the backoff runs another
    // pass rather than leaving sync stuck
    const before = await opened.value.db.getFirstAsync<{ retry_state: string | null }>(
      'SELECT retry_state FROM sync_state WHERE id = 1',
    );
    expect(before?.retry_state).toContain('attempt');
    await act(async () => {
      jest.advanceTimersByTime(400_000);
      await Promise.resolve();
    });
    await settle();
    const after = await opened.value.db.getFirstAsync<{ retry_state: string | null }>(
      'SELECT retry_state FROM sync_state WHERE id = 1',
    );
    // the attempt counter grew, so a retry really ran
    expect(after?.retry_state).not.toBe(before?.retry_state);

    // turning sync off cancels the schedule: no further attempts
    fireEvent(screen.getByTestId('icloud-toggle'), 'valueChange', false);
    await settle();
    const stopped = await opened.value.db.getFirstAsync<{ retry_state: string | null }>(
      'SELECT retry_state FROM sync_state WHERE id = 1',
    );
    await act(async () => {
      jest.advanceTimersByTime(900_000);
      await Promise.resolve();
    });
    await settle();
    const idle = await opened.value.db.getFirstAsync<{ retry_state: string | null }>(
      'SELECT retry_state FROM sync_state WHERE id = 1',
    );
    expect(idle?.retry_state).toBe(stopped?.retry_state);
    expect(screen.getByTestId('icloud-status')).toHaveTextContent(/Off/);
  });

  it('shows the last successful sync time once one exists', async () => {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    await opened.value.db.runAsync(
      `INSERT INTO sync_state (id, change_token, zone_created, retry_state, last_success_at)
       VALUES (1, '4', 1, NULL, ?)
       ON CONFLICT (id) DO UPDATE SET last_success_at = excluded.last_success_at`,
      [Date.UTC(2026, 7, 30, 16, 0)],
    );
    renderRouter('src/app', { initialUrl: '/settings/sync' });
    await screen.findByTestId('icloud-last-sync');
    expect(screen.getByTestId('icloud-last-sync')).not.toHaveTextContent(/Never/);
    expect(screen.getByTestId('icloud-last-sync')).toHaveTextContent(/2026/);
  });
});
