import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentLocation, LocationPermissionError, UserLocation } from '../lib/location';
import { useAuth } from './AuthContext';

interface LocationContextValue {
  location: UserLocation | null;
  loading: boolean;
  denied: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLocation(await getCurrentLocation());
      setDenied(false);
    } catch (e: any) {
      if (e instanceof LocationPermissionError) setDenied(true);
      setError(e?.message ?? 'Lokasiya alınmadı');
    } finally {
      setLoading(false);
    }
  }, []);

  // Grab the location once the user is signed in.
  useEffect(() => {
    if (session && !location) refresh();
    if (!session) {
      setLocation(null);
      setDenied(false);
    }
  }, [session, location, refresh]);

  const value = useMemo<LocationContextValue>(
    () => ({ location, loading, denied, error, refresh }),
    [location, loading, denied, error, refresh]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
