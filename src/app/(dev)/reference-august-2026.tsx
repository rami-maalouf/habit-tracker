import { Redirect } from 'expo-router';

import { ReferenceAugust2026Screen } from '@/features/development/reference-august-2026-screen';

export default function ReferenceAugust2026Route() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <ReferenceAugust2026Screen />;
}
