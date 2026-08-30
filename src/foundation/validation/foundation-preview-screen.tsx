import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, useColorScheme } from 'react-native';

import { triggerActionHaptic } from '@/foundation/haptics';
import { normalizeScheme, semanticColor, spacing } from '@/theme';

import { AccessibilitySection } from './accessibility-section';
import { ColorsSection } from './colors-section';
import { ControlsSection } from './controls-section';
import { previewDefaults } from './fixtures';
import { GeometrySection } from './geometry-section';
import { InteractionSection } from './interaction-section';
import { MaterialSection } from './material-section';
import { TypographySection } from './typography-section';

type FoundationPreviewScreenProps = {
  forceMaterialFallback: boolean;
};

export function FoundationPreviewScreen({ forceMaterialFallback }: FoundationPreviewScreenProps) {
  const scheme = normalizeScheme(useColorScheme());
  const [actionCount, setActionCount] = useState<number>(previewDefaults.actionCount);

  const handlePrimaryAction = useCallback(() => {
    setActionCount((count) => count + 1);
    void triggerActionHaptic();
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Foundation preview' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: semanticColor('groupedBackground', scheme) }}
        contentContainerStyle={{ padding: spacing.lg }}
      >
        <TypographySection />
        <ColorsSection scheme={scheme} />
        <GeometrySection scheme={scheme} />
        <MaterialSection forceFallback={forceMaterialFallback} />
        <ControlsSection onPrimaryAction={handlePrimaryAction} />
        <InteractionSection actionCount={actionCount} />
        <AccessibilitySection scheme={scheme} materialFallbackForced={forceMaterialFallback} />
      </ScrollView>
    </>
  );
}
