import type { AlternateIconName } from '../../../modules/ripples-apple/src/RipplesApple.types';
import RipplesAppleModule from '../../../modules/ripples-apple/src/RipplesAppleModule';

export type { AlternateIconName } from '../../../modules/ripples-apple/src/RipplesApple.types';

export async function supportsAlternateIcons(): Promise<boolean> {
  if (
    typeof RipplesAppleModule?.supportsAlternateIcons !== 'function' ||
    typeof RipplesAppleModule?.setAlternateIcon !== 'function'
  ) {
    return false;
  }
  try {
    return (await RipplesAppleModule.supportsAlternateIcons()) === true;
  } catch {
    return false;
  }
}

export async function setAlternateIcon(name: AlternateIconName | null): Promise<void> {
  const nativeModule = RipplesAppleModule;
  if (
    !nativeModule ||
    typeof nativeModule.setAlternateIcon !== 'function' ||
    !(await supportsAlternateIcons())
  ) {
    throw new Error('Alternate app icons are unavailable on this device.');
  }
  try {
    await nativeModule.setAlternateIcon(name);
  } catch {
    throw new Error('The app icon could not be changed. Try again.');
  }
}
