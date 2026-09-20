import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

export type Role = 'customer' | 'provider';

interface AppContextValue {
  // Which mode the user is currently acting in. Every account can be both a
  // customer and a provider and flip between them inside the app.
  role: Role;
  setRole: (role: Role) => void;
  toggleRole: () => void;
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  /** False until the stored mode for this user has been read back. Anything
   *  that writes the mode to the server must wait for it, or it will publish
   *  the default over the real value. */
  prefsLoaded: boolean;
  resetApp: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

interface StoredPrefs {
  role: Role;
  isOnline: boolean;
}

// Stored per user, so handing the phone to someone else does not drop them
// into the previous owner's mode — or, worse, silently online as them.
const keyFor = (uid: string) => `autofix.mode.${uid}`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [role, setRole] = useState<Role>('customer');
  // Providers opt in explicitly: defaulting to true put every user who so much
  // as opened provider mode online — broadcasting their GPS — without them
  // touching the switch. It is only ever true here because they said so once.
  const [isOnline, setIsOnline] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Restore the mode this user left the app in. Without this, closing the app
  // as an online usta reopened it as a customer — and, because the dashboard
  // mirrors the switch to the server on mount, quietly marked them offline,
  // which stopped their job notifications until they noticed the toggle.
  useEffect(() => {
    let alive = true;
    if (!uid) {
      loadedFor.current = null;
      setRole('customer');
      setIsOnline(false);
      setPrefsLoaded(false);
      return;
    }
    if (loadedFor.current === uid) return;
    loadedFor.current = uid;
    setPrefsLoaded(false);

    AsyncStorage.getItem(keyFor(uid))
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          const p = JSON.parse(raw) as Partial<StoredPrefs>;
          if (p.role === 'customer' || p.role === 'provider') setRole(p.role);
          if (typeof p.isOnline === 'boolean') setIsOnline(p.isOnline);
        }
      })
      .catch(() => {
        // Unreadable storage just means the defaults stand.
      })
      .finally(() => {
        if (alive) setPrefsLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, [uid]);

  // Persist every change, but never before the restore has run — otherwise the
  // initial defaults overwrite what we are about to read back.
  useEffect(() => {
    if (!uid || !prefsLoaded) return;
    const prefs: StoredPrefs = { role, isOnline };
    AsyncStorage.setItem(keyFor(uid), JSON.stringify(prefs)).catch(() => {});
  }, [uid, prefsLoaded, role, isOnline]);

  const value = useMemo<AppContextValue>(
    () => ({
      role,
      setRole,
      toggleRole: () => setRole((r) => (r === 'customer' ? 'provider' : 'customer')),
      isOnline,
      setIsOnline,
      prefsLoaded,
      // Signing out clears the in-memory mode but leaves the stored one alone,
      // so the same person signing back in lands where they left off.
      resetApp: () => {
        setRole('customer');
        setIsOnline(false);
      },
    }),
    [role, isOnline, prefsLoaded]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
