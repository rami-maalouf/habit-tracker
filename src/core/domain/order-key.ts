// stable sortable text keys with room between neighbors, base-36 fractional
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const MID = 'i';

function digitValue(char: string | undefined): number {
  return char === undefined ? 0 : DIGITS.indexOf(char);
}

// returns a key strictly between a and b (null means open-ended)
export function orderKeyBetween(a: string | null, b: string | null): string {
  const low = a ?? '';
  const high = b ?? '';
  if (high !== '' && low >= high) {
    throw new Error('order keys out of order');
  }
  let result = '';
  let index = 0;
  for (;;) {
    const lowDigit = digitValue(low[index]);
    const highDigit = index < high.length ? digitValue(high[index]) : DIGITS.length;
    if (highDigit - lowDigit > 1) {
      result += DIGITS[Math.floor((lowDigit + highDigit) / 2)];
      return result;
    }
    result += DIGITS[lowDigit];
    index += 1;
    /* istanbul ignore next: defensive bound, unreachable through public inputs */
    if (index > 64) {
      throw new Error('order key depth exceeded');
    }
  }
}

export function firstOrderKey(): string {
  return MID;
}

export function orderKeyAfter(last: string | null): string {
  if (last === null) {
    return firstOrderKey();
  }
  return orderKeyBetween(last, null);
}
