import { Stack } from 'expo-router';
import { ScrollView, Text } from 'react-native';

export default function RootScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Ripples' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <Text selectable>Native foundation ready</Text>
      </ScrollView>
    </>
  );
}
