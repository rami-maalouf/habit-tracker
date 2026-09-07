import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { useProduct } from '@/features/product-store';
import { InlineError, PrimaryButton, useScheme } from '@/features/ui';
import { seedReferenceAugust2026 } from '@/testing/fixtures/reference-august-2026';

export function ReferenceAugust2026Screen() {
  const router = useRouter();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seed = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await seedReferenceAugust2026(core, nextCommandId());
    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    invalidate();
    router.replace('/');
  }, [core, invalidate, loading, nextCommandId, router]);

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Reference Demo' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View
          style={{
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <AppText variant="title2">August 2026 demo</AppText>
          <AppText variant="subheadline">
            Adds seven demo boards and their August 17-30 activity to an empty development
            database. This action never changes the app clock.
          </AppText>
          <PrimaryButton
            title={loading ? 'Adding demo data…' : 'Add demo data'}
            onPress={() => void seed()}
            disabled={loading}
            testID="reference-seed-action"
          />
          {error ? <InlineError message={error} testID="reference-seed-error" /> : null}
        </View>
      </ScrollView>
    </View>
  );
}
