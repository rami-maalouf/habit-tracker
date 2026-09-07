import type { AlternateIconName } from '../../../modules/ripples-apple/src/RipplesApple.types';

export type { AlternateIconName } from '../../../modules/ripples-apple/src/RipplesApple.types';

export async function supportsAlternateIcons(): Promise<boolean> {
  return false;
}

export async function setAlternateIcon(_name: AlternateIconName | null): Promise<void> {
  throw new Error('Alternate app icons are unavailable on this device.');
}
