import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

import type { RipplesAppleModuleEvents } from './RipplesApple.types';

declare class RipplesAppleModule extends NativeModule<RipplesAppleModuleEvents> {}

export default requireOptionalNativeModule<RipplesAppleModule>('RipplesApple');
