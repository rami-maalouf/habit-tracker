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
