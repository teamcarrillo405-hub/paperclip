import { useCallback, useEffect, useState } from "react";

// VITE_VAPID_PUBLIC_KEY must be set in your .env file.
// It should be the same value as VAPID_PUBLIC_KEY on the server.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const array = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    array[i] = rawData.charCodeAt(i);
  }
  return array.buffer as ArrayBuffer;
}

interface UsePushNotificationsResult {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: (companyId: string) => Promise<void>;
  unsubscribe: (companyId: string) => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!VAPID_PUBLIC_KEY;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check current subscription status on mount
  useEffect(() => {
    if (!isSupported) return;

    let cancelled = false;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setIsSubscribed(sub !== null);
      })
      .catch(() => {
        // Silently ignore — e.g. when permission is not yet granted
      });

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(
    async (companyId: string) => {
      if (!isSupported || !VAPID_PUBLIC_KEY) return;

      setIsLoading(true);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, subscription }),
        });

        setIsSubscribed(true);
      } finally {
        setIsLoading(false);
      }
    },
    [isSupported],
  );

  const unsubscribe = useCallback(
    async (companyId: string) => {
      if (!isSupported) return;

      setIsLoading(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;

        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, endpoint }),
        });

        setIsSubscribed(false);
      } finally {
        setIsLoading(false);
      }
    },
    [isSupported],
  );

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe };
}
