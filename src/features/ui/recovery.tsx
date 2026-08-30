import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { spacing } from '@/theme';

import { PrimaryButton } from './index';

// shared recovery surface for invalid or missing route parameters
export function RecoveryScreen({ message }: { message: string }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
      <AppText variant="title2" accessibilityRole="header">
        Something is off with this link.
      </AppText>
      <AppText>{message}</AppText>
      <PrimaryButton
        title="Back to Boards"
        onPress={() => router.dismissTo('/')}
        testID="recovery-home"
      />
    </View>
  );
}
