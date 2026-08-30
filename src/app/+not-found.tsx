import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Text selectable>This screen does not exist.</Text>
        <Link replace href="/">
          <Text>Go to the home screen</Text>
        </Link>
      </View>
    </>
  );
}
