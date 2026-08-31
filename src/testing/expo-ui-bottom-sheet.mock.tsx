// reviewed behavior-focused mock: the real bottom sheet presents a native
// swiftui sheet; tests render its children inline and expose the imperative
// handle so close flows can be exercised
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

type MockSheetProps = {
  children: ReactNode;
  onClose?: () => void;
  snapPoints?: (string | number)[];
  enablePanDownToClose?: boolean;
  backgroundStyle?: StyleProp<ViewStyle>;
};

type MockSheetMethods = {
  present: () => void;
  dismiss: () => void;
  close: () => void;
  forceClose: () => void;
  expand: () => void;
  collapse: () => void;
  snapToIndex: (index: number) => void;
  snapToPosition: (position: string | number) => void;
};

export const BottomSheet = forwardRef<MockSheetMethods, MockSheetProps>(
  function BottomSheet({ children, onClose }, ref) {
    useImperativeHandle(ref, () => ({
      present: () => {},
      dismiss: () => onClose?.(),
      close: () => onClose?.(),
      forceClose: () => onClose?.(),
      expand: () => {},
      collapse: () => {},
      snapToIndex: () => {},
      snapToPosition: () => {},
    }));
    return (
      <View testID="bottom-sheet" style={{ flex: 1 }}>
        {children}
      </View>
    );
  },
);

export function BottomSheetView({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>{children}</View>;
}

export const BottomSheetScrollView = ScrollView;

export default BottomSheet;
