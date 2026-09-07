import { advance, compareStamps, decodeStamp, encodeStamp, observe } from '@/core/sync/hybrid-clock';

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
