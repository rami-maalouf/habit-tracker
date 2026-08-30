export type HlcState = {
  wallTime: number;
  counter: number;
};

// stamp: zero-padded wall time, base-36 padded counter, device id.
// lexicographic order equals (wallTime, counter, deviceId) order.
export function encodeStamp(state: HlcState, deviceId: string): string {
  const wall = String(state.wallTime).padStart(14, '0');
  const counter = state.counter.toString(36).padStart(5, '0');
  return `${wall}-${counter}-${deviceId}`;
}

export function decodeStamp(stamp: string): { wallTime: number; counter: number; deviceId: string } {
  const [wall, counter, ...device] = stamp.split('-');
  return {
    wallTime: Number(wall),
    counter: parseInt(counter, 36),
    deviceId: device.join('-'),
  };
}

export function advance(state: HlcState, nowUtcMs: number): HlcState {
  if (nowUtcMs > state.wallTime) {
    return { wallTime: nowUtcMs, counter: 0 };
  }
  return { wallTime: state.wallTime, counter: state.counter + 1 };
}

// the local clock observes every remote stamp so later local mutations sort
// after everything already seen
export function observe(state: HlcState, remoteStamp: string): HlcState {
  const remote = decodeStamp(remoteStamp);
  if (remote.wallTime > state.wallTime) {
    return { wallTime: remote.wallTime, counter: remote.counter };
  }
  if (remote.wallTime === state.wallTime && remote.counter > state.counter) {
    return { wallTime: state.wallTime, counter: remote.counter };
  }
  return state;
}

export function compareStamps(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
