import { Redirect, useLocalSearchParams } from 'expo-router';

import { FoundationPreviewScreen } from '@/foundation/validation/foundation-preview-screen';

export default function FoundationPreviewRoute() {
  const { material } = useLocalSearchParams<{ material?: string }>();

  // preview content never renders in a production bundle
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <FoundationPreviewScreen forceMaterialFallback={material === 'fallback'} />;
}
