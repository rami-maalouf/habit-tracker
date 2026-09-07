import { requireOptionalNativeModule } from 'expo';

type CloudKitNativeModule = {
  cloudKitAvailable?: () => Promise<boolean>;
  cloudKitEnsureZone?: () => Promise<void>;
  cloudKitUpload?: (recordsJSON: string) => Promise<void>;
  cloudKitFetchChanges?: (token: string | null) => Promise<string>;
};

export default requireOptionalNativeModule<CloudKitNativeModule>('RipplesApple');
