// jest replacement for expo-notifications: tests set the permission state
export const notificationsMock = {
  granted: false,
  canAskAgain: true,
  reject: false,
};

export async function getPermissionsAsync() {
  if (notificationsMock.reject) {
    throw new Error('permissions unavailable');
  }
  return {
    granted: notificationsMock.granted,
    canAskAgain: notificationsMock.canAskAgain,
    status: notificationsMock.granted ? 'granted' : 'undetermined',
  };
}

export function setNotificationHandler(): void {}

export function clearLastNotificationResponse(): void {}

export async function getLastNotificationResponseAsync() {
  return null;
}

export async function requestPermissionsAsync() {
  notificationsMock.granted = true;
  return { granted: true, canAskAgain: true, status: 'granted' };
}

export function addNotificationResponseReceivedListener() {
  return { remove: () => {} };
}
