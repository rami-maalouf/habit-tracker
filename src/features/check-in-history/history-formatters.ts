import type { CheckIn } from '@/core/domain/entities';

export function formatCheckInTime(checkIn: CheckIn): string | null {
  if (checkIn.occurredAtUtc === null || checkIn.timeZoneId === null) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: checkIn.timeZoneId,
  }).format(new Date(checkIn.occurredAtUtc));
}

export function formatAmount(checkIn: CheckIn, unit: string | null): string | null {
  if (checkIn.amount === null) {
    return null;
  }
  return unit ? `${checkIn.amount} ${unit}` : String(checkIn.amount);
}
