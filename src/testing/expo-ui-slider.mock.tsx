// behavior-focused test double for @expo/ui/community/slider: exposes the
// controlled value and onValueChange for fireEvent
import { View } from 'react-native';

type MockSliderProps = {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  testID?: string;
  onValueChange?: (value: number) => void;
};

export function Slider({
  value = 0,
  minimumValue = 0,
  maximumValue = 1,
  testID,
  onValueChange,
}: MockSliderProps) {
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ now: value, min: minimumValue, max: maximumValue }}
      testID={testID}
      {...({ onValueChange } as Record<string, unknown>)}
    />
  );
}

export default Slider;
