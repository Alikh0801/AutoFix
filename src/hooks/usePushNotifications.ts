import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { payloadOf, registerForPushNotifications } from '../lib/push';

/**
 * Registers the device for push once a user is signed in, and routes a tapped
 * notification to the right side of the app.
 *
 * Routing is deliberately coarse: the payload says which mode the recipient
 * needs to be in, and flipping `role` remounts that root navigator, whose
 * screens already funnel the user into whatever is live (the Panel into an
 * active job, Home into an active request). Trying to deep-link a specific
 * screen from a cold start would race the navigator's own mount.
 */
export function usePushNotifications(): void {
  const { session } = useAuth();
  const { setRole } = useApp();
  const registeredFor = useRef<string | null>(null);

  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (!uid || registeredFor.current === uid) return;
    registeredFor.current = uid;
    // Failure here is never fatal: Expo Go, a denied permission or a missing
    // Play Services all just mean this device does not get pushes.
    registerForPushNotifications();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      registeredFor.current = null;
      return;
    }

    // Fired when the app is opened by tapping a notification, including from
    // a cold start.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const { role } = payloadOf(response);
      if (role === 'customer' || role === 'provider') setRole(role);
    });

    // A cold start delivers the tap through this instead of the listener.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const { role } = payloadOf(response);
        if (role === 'customer' || role === 'provider') setRole(role);
      })
      .catch(() => {});

    return () => sub.remove();
  }, [uid, setRole]);
}
