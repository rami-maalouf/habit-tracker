// behavior-focused test double for @expo/ui/community/datetime-picker: shows
// the controlled value and exposes onValueChange for fireEvent
import { Text } from 'react-native';

type MockDateTimePickerProps = {
  value: Date;
  mode?: string;
  testID?: string;
  onValueChange?: (event: { nativeEvent: { timestamp: number; utcOffset: number } }, date: Date) => void;
};

export function DateTimePicker({ value, mode = 'date', testID, onValueChange }: MockDateTimePickerProps) {
  return (
    <Text
      testID={testID ?? `datetime-${mode}`}
      accessibilityLabel={`${mode} picker`}
      // rntl fireEvent(element, 'valueChange', event, date) reaches this prop
      {...({ onValueChange } as Record<string, unknown>)}
    >
      {value.toISOString()}
    </Text>
  );
}
