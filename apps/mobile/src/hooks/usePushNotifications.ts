import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerDevice } from '../api/approvals';
import { useAuthStore } from '../store/authStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
    });
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  return tokenResponse.data;
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (cancelled) return;
      setExpoPushToken(token);

      if (token && user) {
        try {
          await registerDevice({
            deviceToken: token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            userId: user.id,
          });
        } catch {
          // ignore registration failure — app still functions
        }
      }
    })();

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (n) => setNotification(n),
    );
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      () => {
        // hook consumers can wire routing from data payload
      },
    );

    return () => {
      cancelled = true;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user]);

  return { expoPushToken, notification };
}
