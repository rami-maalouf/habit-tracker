import { parseBoardId, parseCheckInId, parseCommandId, parseReminderId } from '@/core/domain/ids';
import { firstOrderKey, orderKeyAfter, orderKeyBetween } from '@/core/domain/order-key';
import {
  validateAmount,
  validateLogicalDateInput,
  validateMinuteOfDay,
  validateNote,
  validateReminderMessage,
  validateWeekdaysMask,
} from '@/core/domain/validation';
import type { LogicalDate } from '@/core/domain/ids';
import { advance, compareStamps, decodeStamp, encodeStamp, observe } from '@/core/sync/hybrid-clock';

describe('branded id parsing', () => {
  const valid = 'A1B2C3D4-0000-4000-8000-000000000001';

  it('parses structurally valid uuids and lowercases them', () => {
    expect(parseBoardId(valid)).toBe(valid.toLowerCase());
    expect(parseCheckInId(valid)).toBe(valid.toLowerCase());
    expect(parseReminderId(valid)).toBe(valid.toLowerCase());
    expect(parseCommandId(valid)).toBe(valid.toLowerCase());
  });

  it('rejects malformed ids', () => {
    for (const bad of ['', '123', 'not-a-uuid', `${valid}x`, valid.replace('-4', '-1')]) {
      expect(parseBoardId(bad)).toBeNull();
    }
  });
});

describe('order keys', () => {
  it('generates strictly increasing append keys', () => {
    let key = firstOrderKey();
    for (let index = 0; index < 50; index += 1) {
      const next = orderKeyAfter(key);
      expect(next > key).toBe(true);
      key = next;
    }
  });

  it('generates keys strictly between any two neighbors', () => {
    let low = 'a';
    let high = 'b';
    for (let index = 0; index < 30; index += 1) {
      const mid = orderKeyBetween(low, high);
      expect(mid > low).toBe(true);
      expect(mid < high).toBe(true);
      // alternate narrowing from both sides
      if (index % 2 === 0) {
        low = mid;
      } else {
        high = mid;
      }
    }
  });

  it('supports inserting before the first key', () => {
    const before = orderKeyBetween(null, firstOrderKey());
    expect(before < firstOrderKey()).toBe(true);
  });

  it('rejects out-of-order inputs', () => {
    expect(() => orderKeyBetween('b', 'a')).toThrow();
  });
});

describe('hybrid logical clock', () => {
  it('advances on wall time and falls back to counters', () => {
    let state = { wallTime: 1000, counter: 0 };
    state = advance(state, 2000);
    expect(state).toEqual({ wallTime: 2000, counter: 0 });
    state = advance(state, 2000);
    expect(state).toEqual({ wallTime: 2000, counter: 1 });
    state = advance(state, 1500);
    expect(state).toEqual({ wallTime: 2000, counter: 2 });
  });

  it('round-trips stamps and keeps lexicographic order', () => {
    const a = encodeStamp({ wallTime: 2000, counter: 1 }, 'device-a');
    const b = encodeStamp({ wallTime: 2000, counter: 2 }, 'device-a');
    const c = encodeStamp({ wallTime: 3000, counter: 0 }, 'device-a');
    expect(compareStamps(a, b)).toBeLessThan(0);
    expect(compareStamps(b, c)).toBeLessThan(0);
    expect(compareStamps(c, c)).toBe(0);
    expect(decodeStamp(b)).toEqual({ wallTime: 2000, counter: 2, deviceId: 'device-a' });
  });

  it('observes remote stamps so later local stamps sort after them', () => {
    const remote = encodeStamp({ wallTime: 9000, counter: 4 }, 'device-b');
    let state = { wallTime: 2000, counter: 7 };
    state = observe(state, remote);
    expect(state).toEqual({ wallTime: 9000, counter: 4 });
    const sameWall = encodeStamp({ wallTime: 9000, counter: 9 }, 'device-b');
    state = observe(state, sameWall);
    expect(state).toEqual({ wallTime: 9000, counter: 9 });
    const older = encodeStamp({ wallTime: 100, counter: 0 }, 'device-b');
    expect(observe(state, older)).toEqual(state);
  });
});

describe('validation edges', () => {
  const today = '2026-08-30' as LogicalDate;

  it('normalizes notes and rejects overlong ones', () => {
    expect(validateNote(undefined)).toEqual({ ok: true, value: null });
    expect(validateNote('   ')).toEqual({ ok: true, value: null });
    expect(validateNote(' hi ')).toEqual({ ok: true, value: 'hi' });
    expect(validateNote('x'.repeat(10001)).ok).toBe(false);
  });

  it('applies amount boundaries', () => {
    expect(validateAmount(0.001).ok).toBe(true);
    expect(validateAmount(1_000_000_000).ok).toBe(true);
    expect(validateAmount(1_000_000_001).ok).toBe(false);
    expect(validateAmount(Number.NaN).ok).toBe(false);
    expect(validateAmount(1.0001).ok).toBe(false);
  });

  it('validates logical date input shape and future rule', () => {
    expect(validateLogicalDateInput('2026-08-30', today).ok).toBe(true);
    expect(validateLogicalDateInput('2026-08-31', today).ok).toBe(false);
    expect(validateLogicalDateInput('2026-2-3', today).ok).toBe(false);
  });

  it('validates reminder primitives', () => {
    expect(validateWeekdaysMask(0).ok).toBe(false);
    expect(validateWeekdaysMask(0b1111111).ok).toBe(true);
    expect(validateWeekdaysMask(0b10000000).ok).toBe(false);
    expect(validateMinuteOfDay(0).ok).toBe(true);
    expect(validateMinuteOfDay(1439).ok).toBe(true);
    expect(validateMinuteOfDay(1440).ok).toBe(false);
    expect(validateReminderMessage(' remember ')).toEqual({ ok: true, value: 'remember' });
    expect(validateReminderMessage('m'.repeat(181)).ok).toBe(false);
  });
});
