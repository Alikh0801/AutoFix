import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Push registration and token bookkeeping.
//
// Why this exists: a provider only ever saw a request while the app was open
// on the Panel tab, and provider_feed drops a request 15 minutes after it is
// created. In practice a stranded driver's request only reached whoever
// happened to be staring at their phone. The notification is what closes that
// gap — the database sends it (see migration 0027), this file is only about
// getting a token and keeping it current.
//
// Remote notifications do not work in Expo Go on Android (SDK 53+), so this is
// a no-op there and needs the standalone preview build.

/** Android must have a channel before a token is requested, and every message
 *  we send names one of these. Importance is what decides whether the
 *  notification actually makes a sound and shows up as a heads-up banner. */
export const CHANNELS = {
  requests: 'requests',
  offers: 'offers',
  job: 'job',
} as const;

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // A new job nearby is the one thing worth interrupting someone for.
  await Notifications.setNotificationChannelAsync(CHANNELS.requests, {
    name: 'Yeni sorğular',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.offers, {
    name: 'Təkliflər',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.job, {
    name: 'Sifariş gedişatı',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function projectId(): string | undefined {
  // Set by EAS; `easConfig` is the one that survives in a release build.
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'denied' | 'unsupported' | 'error' };

/**
 * Ask for permission, get an Expo push token, and store it against the
 * signed-in user. Safe to call on every launch: the row is keyed by token, so
 * re-registering just refreshes it, and handing the same device to another
 * account moves the token rather than duplicating it.
 */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  try {
    await ensureAndroidChannels();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    // Only prompt if the OS hasn't already given us a final answer — asking
    // again after a denial does nothing but is worth avoiding.
    if (status !== 'granted' && existing.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const id = projectId();
    if (!id) return { ok: false, reason: 'unsupported' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return { ok: false, reason: 'unsupported' };

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return { ok: false, reason: 'error' };

    const { error } = await supabase.from('push_tokens').upsert(
      { token, user_id: uid, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'token' }
    );
    if (error) return { ok: false, reason: 'error' };

    return { ok: true, token };
  } catch {
    // Expo Go on Android, an emulator without Play Services, no network —
    // none of which should take the app down with them.
    return { ok: false, reason: 'unsupported' };
  }
}

/** Drop this device's token, so a signed-out phone stops getting someone
 *  else's jobs. Must run while the session is still valid (RLS). */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    const id = projectId();
    if (!id) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // best-effort
  }
}

/** What the database puts in a notification's `data` payload. `role` is which
 *  side of the app the recipient needs to be in to act on it — the sending
 *  trigger knows that, and the tap handler should not have to infer it. */
export interface PushPayload {
  type?: 'new_request' | 'new_offer' | 'job_status';
  role?: 'customer' | 'provider';
  requestId?: string;
}

export function payloadOf(response: Notifications.NotificationResponse): PushPayload {
  const data = response.notification.request.content.data;
  return (data ?? {}) as PushPayload;
}
