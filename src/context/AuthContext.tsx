import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchMyProfile, setProviderStatus, Profile } from '../lib/api';
import { unregisterPushNotifications } from '../lib/push';

export interface SignUpInput {
  phone: string; // E.164, e.g. "+994553221111"
  fullName: string;
  dateOfBirth: string; // ISO "YYYY-MM-DD"
  vehicle: { make: string; model: string; color: string; plate: string };
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (phone: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// TEST-MODE AUTH: registration is phone-only with no real SMS verification
// yet, but Supabase's phone provider still needs *some* credential to create
// a session. We derive a fixed password from the phone number itself so it
// never has to be shown to (or chosen by) the user. Replace this with
// signInWithOtp/verifyOtp once a real SMS provider is wired up in production.
//
// The "jolt-" prefix predates the rename to AutoFix and deliberately stays:
// it is the salt every existing test account's stored password was derived
// from, so changing it would lock all of them out. It is invisible to users
// and disappears entirely with the switch to OTP.
function testModePassword(phoneE164: string): string {
  return `jolt-test-${phoneE164}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Restore any persisted session on launch.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    // Keep in sync with sign-in / sign-out / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the signed-in user's profile row; clear it on sign-out.
  useEffect(() => {
    if (session?.user) {
      fetchMyProfile()
        .then(setProfile)
        .catch(() => setProfile(null));
    } else {
      setProfile(null);
    }
  }, [session?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      initializing,
      signUp: async ({ phone, fullName, dateOfBirth, vehicle }) => {
        const { error } = await supabase.auth.signUp({
          phone,
          password: testModePassword(phone),
          options: {
            data: {
              full_name: fullName.trim(),
              date_of_birth: dateOfBirth,
              vehicle_make: vehicle.make.trim(),
              vehicle_model: vehicle.model.trim(),
              vehicle_color: vehicle.color.trim(),
              vehicle_plate: vehicle.plate.trim(),
            },
          },
        });
        if (error) throw error;
      },
      signIn: async (phone) => {
        const { error } = await supabase.auth.signInWithPassword({
          phone,
          password: testModePassword(phone),
        });
        if (error) throw error;
      },
      signOut: async () => {
        // Nothing else ever cleared is_online, so every signed-out provider
        // stayed "online" in the database with their last known coordinates.
        // Has to happen before signOut, while the session can still write.
        try {
          await setProviderStatus(false);
        } catch {
          // not a provider, or offline — signing out matters more
        }
        // Drop the push token too, so a shared phone stops receiving the
        // previous account's jobs. Also has to run before the session dies.
        await unregisterPushNotifications();
        await supabase.auth.signOut();
      },
    }),
    [session, profile, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
