// behavior-focused test double for @expo/ui (jest-expo ships no mock and the
// real package needs native ObservableState). it preserves labels, disabled
// semantics, and change callbacks so host composition tests stay meaningful.
// native rendering truth comes from argent on the simulator.
import type { ReactNode } from 'react';
import {
  Pressable,
  Switch as RNSwitch,
  Text as RNText,
  TextInput as RNTextInput,
  View,
} from 'react-native';

type Children = { children?: ReactNode };

export function Host({ children }: Children) {
  return <View testID="expo-ui-host">{children}</View>;
}

export function Column({ children }: Children) {
  return <View>{children}</View>;
}

export function Row({ children }: Children) {
  return <View style={{ flexDirection: 'row' }}>{children}</View>;
}

export function Spacer() {
  return <View />;
}

export function Text({ children }: Children) {
  return <RNText>{children}</RNText>;
}

type ButtonProps = Children & {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
};

export function Button({ label, onPress, disabled, children }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
    >
      <RNText>{label ?? children}</RNText>
    </Pressable>
  );
}

type SwitchProps = {
  label?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export function Switch({ label, value, onValueChange, disabled }: SwitchProps) {
  return (
    <Row>
      <RNText>{label}</RNText>
      <RNSwitch
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled === true }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </Row>
  );
}

type SliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  testID?: string;
};

export function Slider({ value, min = 0, max = 1, disabled, testID }: SliderProps) {
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityState={{ disabled: disabled === true }}
      accessibilityValue={{ now: value, min, max }}
      testID={testID}
    />
  );
}

type PickerItemProps = { label: string; value: string | number };

function PickerItem({ label }: PickerItemProps) {
  return <RNText>{label}</RNText>;
}

type PickerProps = Children & {
  selectedValue: string | number;
  onValueChange: (value: never) => void;
  enabled?: boolean;
  testID?: string;
};

export function Picker({ selectedValue, children, testID }: PickerProps) {
  return (
    <View
      accessible
      accessibilityRole="combobox"
      accessibilityValue={{ text: String(selectedValue) }}
      testID={testID}
    >
      {children}
    </View>
  );
}

Picker.Item = PickerItem;

export function TextInput({ placeholder }: { placeholder?: string }) {
  return <RNTextInput placeholder={placeholder} />;
}

export function useNativeState<T>(initial: T): { value: T } {
  return { value: initial };
}
