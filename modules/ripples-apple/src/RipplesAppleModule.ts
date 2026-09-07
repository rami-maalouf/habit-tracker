import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

import type { AlternateIconName, RipplesAppleModuleEvents } from './RipplesApple.types';

declare class RipplesAppleModule extends NativeModule<RipplesAppleModuleEvents> {
  supportsAlternateIcons(): Promise<boolean>;
  setAlternateIcon(name: AlternateIconName | null): Promise<void>;
}

export default requireOptionalNativeModule<RipplesAppleModule>('RipplesApple');
