import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness, type TestHarness } from '../helpers/test-db';

import { validateInboundRecord } from '@/core/sync/inbound-validation';
import { SYNC_SCHEMA_VERSION, periodEntityId } from '@/core/sync/records';
import type { SyncRecord } from '@/core/sync/transport';

let boardId = '00000000-0000-4000-8000-0000000000a1';
const ENTITY_ID = '00000000-0000-4000-8000-0000000000b1';
const STAMP = '99999999999999-00001-other';
type RecordOverrides = Partial<Omit<SyncRecord, 'fields'>> & {
  fields?: Record<string, unknown>;
};

function boardRecord(overrides: RecordOverrides = {}): SyncRecord {
  const { fields: fieldOverrides, ...recordOverrides } = overrides;
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType: 'board',
    entityId: ENTITY_ID,
    mutationStamp: STAMP,
    deleted: false,
    fields: {
      id: ENTITY_ID,
      title: ' board ',
      symbol: 'star.fill',
      accent_hex: '#70a7ff',
      uses_tinted_background: 1,
      tracks_amount: 0,
      amount_unit: ' reps ',
      quick_amount: 1,
      tracks_time: 0,
      start_of_day_minute: 0,
      metrics_enabled: 1,
      order_key: 'm0',
      archived_at: null,
      created_at: 1,
      updated_at: 2,
      deleted_at: null,
      ...(fieldOverrides ?? {}),
    },
    ...recordOverrides,
  } as SyncRecord;
}

function checkInRecord(overrides: RecordOverrides = {}): SyncRecord {
  const { fields: fieldOverrides, ...recordOverrides } = overrides;
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType: 'check_in',
    entityId: ENTITY_ID,
    mutationStamp: STAMP,
    deleted: false,
    fields: {
      id: ENTITY_ID,
      board_id: boardId,
      logical_date: '2026-08-20',
      occurred_at_utc: null,
      time_zone_id: null,
      offset_minutes: null,
      amount: null,
      note: ' note ',
      source: 'sync',
      idempotency_key: '00000000-0000-4000-8000-0000000000c1',
      created_at: 1,
      updated_at: 2,
      deleted_at: null,
      ...(fieldOverrides ?? {}),
    },
    ...recordOverrides,
  } as SyncRecord;
}

function reminderRecord(overrides: RecordOverrides = {}): SyncRecord {
  const { fields: fieldOverrides, ...recordOverrides } = overrides;
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType: 'reminder',
    entityId: ENTITY_ID,
    mutationStamp: STAMP,
    deleted: false,
    fields: {
      id: ENTITY_ID,
      board_id: boardId,
      weekdays_mask: 1,
      minute_of_day: 480,
      message: ' message ',
      enabled: 1,
      created_at: 1,
      updated_at: 2,
      deleted_at: null,
      ...(fieldOverrides ?? {}),
    },
    ...recordOverrides,
  } as SyncRecord;
}

function periodRecord(overrides: RecordOverrides = {}): SyncRecord {
  const { fields: fieldOverrides, ...recordOverrides } = overrides;
  const startDate = '2026-08-20';
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType: 'activity_period',
    entityId: periodEntityId(boardId, startDate),
    mutationStamp: STAMP,
    deleted: false,
    fields: {
      board_id: boardId,
      start_date: startDate,
      end_date: null,
      deleted_at: null,
      ...(fieldOverrides ?? {}),
    },
    ...recordOverrides,
  } as SyncRecord;
}

async function validate(harness: TestHarness, value: unknown) {
  return harness.db.withTransactionAsync((tx) => validateInboundRecord(tx, value));
}

describe('inbound sync validation', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness();
    boardId = await createBoardForTest(harness);
  });

  afterEach(async () => {
    await harness.db.closeAsync();
  });

  it('fails closed when a stable identity cannot be established', async () => {
    const unknowns: unknown[] = [
      null,
      [],
      { ...boardRecord(), entityType: 'future' },
      { ...boardRecord(), entityId: 42 },
      { ...boardRecord(), mutationStamp: 42 },
      { ...boardRecord(), mutationStamp: 'bad' },
      { ...boardRecord(), mutationStamp: '99999999999999-00001-not valid' },
      { ...boardRecord(), entityId: 'bad' },
      {
        ...periodRecord(),
        entityId: 'bad',
      },
      {
        ...periodRecord(),
        entityId: periodEntityId('bad', '2026-08-20'),
      },
      {
        ...periodRecord(),
        entityId: periodEntityId(boardId, '2026-02-30'),
      },
      {
        schemaVersion: 1,
        entityType: 'settings',
        entityId: 'wrong',
        mutationStamp: STAMP,
        deleted: false,
        fields: {},
      },
    ];
    for (const value of unknowns) {
      await expect(validate(harness, value)).resolves.toEqual({ kind: 'unidentifiable' });
    }
  });

  it('rejects malformed envelopes after retaining their stable identity', async () => {
    const malformed: unknown[] = [
      { ...boardRecord(), schemaVersion: 2 },
      { ...boardRecord(), deleted: 'no' },
      { ...boardRecord(), fields: [] },
    ];
    for (const value of malformed) {
      expect((await validate(harness, value)).kind).toBe('invalid');
    }
  });

  it('normalizes a valid board and rejects every structural and domain invariant', async () => {
    const valid = await validate(harness, boardRecord());
    expect(valid.kind).toBe('valid');
    if (valid.kind === 'valid') {
      expect(valid.record.fields).toMatchObject({
        title: 'board',
        accent_hex: '#70A7FF',
        amount_unit: 'reps',
      });
    }

    const invalidFields: Record<string, unknown>[] = [
      { id: boardId },
      { title: 1 },
      { symbol: 1 },
      { accent_hex: 1 },
      { amount_unit: 1 },
      { quick_amount: '1' },
      { start_of_day_minute: '0' },
      { uses_tinted_background: 2 },
      { tracks_amount: 2 },
      { tracks_time: 2 },
      { metrics_enabled: 2 },
      { order_key: 1 },
      { order_key: 'A' },
      { archived_at: 'later' },
      { created_at: Number.NaN },
      { created_at: 8_640_000_000_000_001 },
      { updated_at: 'later' },
      { updated_at: Number.NaN },
      { deleted_at: 'later' },
      { title: ' ' },
      { symbol: 'bad' },
      { accent_hex: 'bad' },
      { amount_unit: 'x'.repeat(21) },
      { quick_amount: 0 },
      { start_of_day_minute: 1 },
    ];
    for (const fields of invalidFields) {
      expect((await validate(harness, boardRecord({ fields }))).kind).toBe('invalid');
    }
  });

  it('sanitizes board tombstones and rejects unsafe structural values', async () => {
    const valid = await validate(
      harness,
      boardRecord({ deleted: true, fields: { title: 'secret', deleted_at: null } }),
    );
    expect(valid.kind).toBe('valid');
    if (valid.kind === 'valid') {
      expect(valid.record.fields).toMatchObject({ title: '', amount_unit: null, archived_at: null });
    }
    for (const fields of [{ id: boardId }, { order_key: 1 }, { order_key: 'A' }, { created_at: Number.NaN }]) {
      expect((await validate(harness, boardRecord({ deleted: true, fields }))).kind).toBe(
        'invalid',
      );
    }
  });

  it('validates check-in content, timestamps, ids, and parent state', async () => {
    const valid = await validate(harness, checkInRecord());
    expect(valid.kind).toBe('valid');
    if (valid.kind === 'valid') {
      expect(valid.record.fields.note).toBe('note');
    }
    const invalidFields: Record<string, unknown>[] = [
      { id: boardId },
      { board_id: 1 },
      { board_id: 'bad' },
      { logical_date: 1 },
      { logical_date: '2026-02-30' },
      { note: 1 },
      { amount: '1' },
      { source: 1 },
      { source: 'bad' },
      { idempotency_key: 1 },
      { idempotency_key: 'bad' },
      { occurred_at_utc: 1, time_zone_id: null, offset_minutes: null },
      { occurred_at_utc: 1, time_zone_id: 'UTC', offset_minutes: Number.NaN },
      { occurred_at_utc: 1, time_zone_id: 'UTC', offset_minutes: -1441 },
      { occurred_at_utc: 1, time_zone_id: 'UTC', offset_minutes: 1441 },
      { occurred_at_utc: 1, time_zone_id: 'Not/AZone', offset_minutes: 0 },
      { created_at: Number.NaN },
      { amount: 0 },
      { note: 'x'.repeat(10001) },
    ];
    for (const fields of invalidFields) {
      expect((await validate(harness, checkInRecord({ fields }))).kind).toBe('invalid');
    }
    const timed = await validate(
      harness,
      checkInRecord({
        fields: { occurred_at_utc: 1.5, time_zone_id: 'UTC', offset_minutes: 9.35 },
      }),
    );
    expect(timed.kind).toBe('valid');
    expect((await validate(harness, checkInRecord({ fields: { board_id: ENTITY_ID } }))).kind).toBe(
      'deferred',
    );
  });

  it('sanitizes check-in tombstones and validates their structural linkage', async () => {
    const valid = await validate(
      harness,
      checkInRecord({ deleted: true, fields: { note: 'secret', idempotency_key: 'secret' } }),
    );
    expect(valid.kind).toBe('valid');
    if (valid.kind === 'valid') {
      expect(valid.record.fields).toMatchObject({
        note: null,
        source: 'sync',
        idempotency_key: ENTITY_ID,
      });
    }
    for (const fields of [{ id: boardId }, { created_at: Number.NaN }]) {
      expect((await validate(harness, checkInRecord({ deleted: true, fields }))).kind).toBe(
        'invalid',
      );
    }
  });

  it('validates reminder rules and sanitizes reminder tombstones', async () => {
    const valid = await validate(harness, reminderRecord());
    expect(valid.kind).toBe('valid');
    if (valid.kind === 'valid') {
      expect(valid.record.fields.message).toBe('message');
    }
    const invalidFields: Record<string, unknown>[] = [
      { id: boardId },
      { weekdays_mask: '1' },
      { weekdays_mask: 0 },
      { minute_of_day: '1' },
      { minute_of_day: 1440 },
      { message: 1 },
      { enabled: 2 },
      { created_at: Number.NaN },
      { message: 'x'.repeat(181) },
    ];
    for (const fields of invalidFields) {
      expect((await validate(harness, reminderRecord({ fields }))).kind).toBe('invalid');
    }
    const tombstone = await validate(
      harness,
      reminderRecord({ deleted: true, fields: { message: 'secret' } }),
    );
    expect(tombstone.kind).toBe('valid');
    if (tombstone.kind === 'valid') {
      expect(tombstone.record.fields).toMatchObject({ message: null, enabled: 0 });
    }
    for (const fields of [{ id: boardId }, { created_at: Number.NaN }]) {
      expect((await validate(harness, reminderRecord({ deleted: true, fields }))).kind).toBe(
        'invalid',
      );
    }
  });

  it('validates period identity, dates, optional fields, and parent linkage', async () => {
    expect((await validate(harness, periodRecord())).kind).toBe('valid');
    expect((await validate(harness, periodRecord({ fields: { end_date: '2026-08-21' } }))).kind).toBe(
      'valid',
    );
    const tombstone = await validate(
      harness,
      periodRecord({ deleted: true, fields: { end_date: 'private malformed value' } }),
    );
    expect(tombstone.kind).toBe('valid');
    if (tombstone.kind === 'valid') {
      expect(tombstone.record.fields.end_date).toBeNull();
    }
    const invalidFields: Record<string, unknown>[] = [
      { board_id: ENTITY_ID },
      { start_date: '2026-08-21' },
      { end_date: 1 },
      { end_date: '2026-02-30' },
      { end_date: '2026-08-19' },
      { deleted_at: 'later' },
    ];
    for (const fields of invalidFields) {
      expect((await validate(harness, periodRecord({ fields }))).kind).toBe('invalid');
    }
    expect(
      (
        await validate(
          harness,
          periodRecord({
            entityId: periodEntityId(ENTITY_ID, '2026-08-20'),
            fields: { board_id: ENTITY_ID },
          }),
        )
      ).kind,
    ).toBe('deferred');
  });

  it('validates and canonicalizes the settings JSON array', async () => {
    const mixedCaseId = '00000000-0000-4000-8000-0000000000aF';
    const settings = (fields: unknown, deleted = false): SyncRecord => ({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'settings',
      entityId: 'app-settings',
      mutationStamp: STAMP,
      deleted,
      fields: fields as SyncRecord['fields'],
    });
    const valid = await validate(
      harness,
      settings({
        metrics_education_dismissed: JSON.stringify([mixedCaseId, mixedCaseId.toUpperCase()]),
      }),
    );
    expect(valid.kind).toBe('valid');
    if (valid.kind === 'valid') {
      expect(valid.record.fields.metrics_education_dismissed).toBe(
        JSON.stringify([mixedCaseId, mixedCaseId.toUpperCase()]),
      );
    }
    const invalid = [
      settings({}, true),
      settings({ metrics_education_dismissed: 1 }),
      settings({ metrics_education_dismissed: 'not json' }),
      settings({ metrics_education_dismissed: '{}' }),
      settings({ metrics_education_dismissed: '[1]' }),
      settings({ metrics_education_dismissed: '["bad"]' }),
    ];
    for (const record of invalid) {
      expect((await validate(harness, record)).kind).toBe('invalid');
    }
  });

  it('accepts stored children and tombstones while their existing parent is tombstoned', async () => {
    await harness.db.runAsync('UPDATE boards SET deleted_at = 3 WHERE id = ?', [boardId]);
    expect((await validate(harness, checkInRecord())).kind).toBe('valid');
    expect((await validate(harness, reminderRecord())).kind).toBe('valid');
    expect((await validate(harness, checkInRecord({ deleted: true }))).kind).toBe('valid');
    expect((await validate(harness, reminderRecord({ deleted: true }))).kind).toBe('valid');
  });
});
