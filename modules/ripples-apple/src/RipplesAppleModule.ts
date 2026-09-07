import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

import type { AlternateIconName, RipplesAppleModuleEvents } from './RipplesApple.types';

declare class RipplesAppleModule extends NativeModule<RipplesAppleModuleEvents> {
  supportsAlternateIcons(): Promise<boolean>;
  setAlternateIcon(name: AlternateIconName | null): Promise<void>;
  cloudKitAvailable(): Promise<boolean>;
  cloudKitEnsureZone(): Promise<void>;
  cloudKitUpload(recordsJSON: string): Promise<void>;
  cloudKitFetchChanges(token: string | null): Promise<string>;
}

export default requireOptionalNativeModule<RipplesAppleModule>('RipplesApple');
