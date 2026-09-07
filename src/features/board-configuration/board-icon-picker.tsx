import { BottomSheet, RNHostView } from '@expo/ui';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { Icon } from '@/components/foundation/icon';
import { minimumTouchTarget } from '@/foundation/accessibility';
import { radius, radiusCurve, semanticColor, semanticFallbacks, spacing } from '@/theme';

import {
  boardIconCategories,
  filterBoardIcons,
  type BoardIconCategory,
} from '../boards/board-icon-catalog';
import { BoardSymbol } from '../boards/board-symbol';
import { ProductPressable, useScheme } from '../ui';

type BoardIconPickerProps = {
  isPresented: boolean;
  symbol: string;
  accent: string;
  onSelect: (symbol: string) => void;
  onDismiss: () => void;
};

export function BoardIconPicker({ isPresented, symbol, accent, onSelect, onDismiss }: BoardIconPickerProps) {
  const scheme = useScheme();
  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={['half', 'full']}
      contentPadding={{ top: spacing.md }}
      containerColor={semanticColor('groupedBackground', scheme)}
      testID="symbol-picker"
    >
      <RNHostView>
        <View style={{ flexGrow: 1, height: 0 }}>
          <IconPickerContent symbol={symbol} accent={accent} onSelect={onSelect} onDismiss={onDismiss} />
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

function IconPickerContent({ symbol, accent, onSelect, onDismiss }: Omit<BoardIconPickerProps, 'isPresented'>) {
  const scheme = useScheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<BoardIconCategory | 'All'>('All');
  const icons = useMemo(() => filterBoardIcons(query, category), [query, category]);

  return (
    <View style={{ flex: 1 }} accessibilityViewIsModal>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="title2" accessibilityRole="header">Choose an icon</AppText>
          <ProductPressable onPress={onDismiss} label="Close icon picker" testID="close-symbol-picker">
            <Icon name="close" size={18} color={semanticFallbacks.secondaryLabel[scheme]} />
          </ProductPressable>
        </View>
        <TextInput
          accessibilityLabel="Search icons"
          placeholder="Search icons"
          placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={{
            minHeight: minimumTouchTarget,
            paddingHorizontal: spacing.md,
            color: semanticColor('label', scheme) as string,
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            borderRadius: radius.md,
            borderCurve: radiusCurve,
            fontSize: 17,
          }}
          testID="symbol-search"
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}
        style={{ flexGrow: 0, flexShrink: 0 }}
      >
        {(['All', ...boardIconCategories] as const).map((entry) => (
          <ProductPressable
            key={entry}
            label={`${entry} icons`}
            selected={category === entry}
            onPress={() => setCategory(entry)}
            testID={`icon-category-${entry.toLowerCase()}`}
            style={{ paddingHorizontal: spacing.md }}
          >
            <AppText variant="subheadline" selectable={false} style={{ color: category === entry ? accent : semanticColor('secondaryLabel', scheme), fontWeight: category === entry ? '600' : '400' }}>
              {entry}
            </AppText>
            <View style={{ height: 2, alignSelf: 'stretch', backgroundColor: category === entry ? accent : 'transparent', marginTop: spacing.xs }} />
          </ProductPressable>
        ))}
      </ScrollView>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        testID="symbol-picker-results"
      >
        {icons.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {icons.map((entry) => (
              <ProductPressable
                key={entry.symbol}
                label={`${entry.label} icon`}
                selected={symbol === entry.symbol}
                onPress={() => onSelect(entry.symbol)}
                testID={`symbol-${entry.symbol}`}
                style={{
                  width: 64,
                  height: 64,
                  backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
                  borderRadius: radius.lg,
                  borderCurve: radiusCurve,
                  borderWidth: symbol === entry.symbol ? 2 : 1,
                  borderColor: symbol === entry.symbol ? accent : semanticColor('separator', scheme),
                }}
              >
                <BoardSymbol symbol={entry.symbol} color={accent} size={28} />
              </ProductPressable>
            ))}
          </View>
        ) : (
          <View style={{ paddingVertical: spacing.xl, gap: spacing.xs, alignItems: 'center' }} testID="symbol-picker-empty">
            <AppText variant="headline">No icons found</AppText>
            <AppText variant="footnote" style={{ textAlign: 'center' }}>Try another word or choose All.</AppText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
